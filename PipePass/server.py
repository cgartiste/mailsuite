"""
PipePass API Server — Flask HTTP server
Exposes /api/mailsuite/* endpoints for MailSuite integration.
Port: 7070
"""
import os
import sys
import uuid
import threading
import subprocess
import tempfile
import shutil
import time
import requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

MAILSUITE_URL = os.environ.get("MAILSUITE_URL", "http://localhost:5050")
PORT = int(os.environ.get("PORT", 7070))
SELF_URL = os.environ.get("SELF_URL", f"http://localhost:{PORT}")

# In-memory job store: job_id -> {status, batch_name, stats, results}
jobs = {}
jobs_lock = threading.Lock()
all_results = []  # list of {email, password, fa_secret, app_password, batch}
results_lock = threading.Lock()


# ── Job runner ───────────────────────────────────────────────────────────────

def run_job(job_id, credentials_text, num_browsers, callback_url, job_db_id):
    work_dir = tempfile.mkdtemp(prefix="pipepass_")
    cred_file = os.path.join(work_dir, "credentials.txt")
    result_file = os.path.join(work_dir, "account_details.txt")

    lines = [l.strip() for l in credentials_text.splitlines() if l.strip()]
    total = len(lines)

    with open(cred_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    script = os.path.join(os.path.dirname(__file__), "apppassword.py")

    with jobs_lock:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["total"] = total

    try:
        proc = subprocess.Popen(
            [sys.executable, script],
            cwd=work_dir,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        proc.communicate(input=f"{num_browsers}\n", timeout=3600)

        result_lines = []
        if os.path.exists(result_file):
            with open(result_file, "r", encoding="utf-8") as f:
                result_lines = [l.strip() for l in f if l.strip()]

        success = len(result_lines)
        csv_rows = ["Email,Password,FA Secret (TOTP),App Password"]
        batch_name = jobs[job_id].get("batch_name", "")

        with results_lock:
            for line in result_lines:
                parts = line.split(":", 3)
                if len(parts) == 4:
                    all_results.append({
                        "email": parts[0], "password": parts[1],
                        "fa_secret": parts[2], "app_password": parts[3],
                        "batch": batch_name,
                    })
                    csv_rows.append(",".join(f'"{p}"' for p in parts))

        results_csv = "\n".join(csv_rows)
        stats = {"success": success, "failed": total - success, "total": total}

        with jobs_lock:
            jobs[job_id].update({"status": "done", "stats": stats, "results_csv": results_csv})

        if callback_url:
            try:
                requests.post(callback_url, json={
                    "job_db_id": job_db_id, "status": "done",
                    "results_csv": results_csv, "stats": stats,
                }, timeout=10)
            except Exception:
                pass

    except Exception as e:
        with jobs_lock:
            jobs[job_id].update({"status": "error", "error": str(e)})
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# ── UI Routes ─────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return render_template("index.html", port=PORT)


@app.get("/ui/stats")
def ui_stats():
    with jobs_lock:
        snap = list(jobs.items())
    total = len(snap)
    running = sum(1 for _, j in snap if j.get("status") == "running")
    done = sum(1 for _, j in snap if j.get("status") == "done")
    accounts = sum((j.get("stats") or {}).get("success", 0) for _, j in snap)
    job_list = [{"id": k, "batch_name": v.get("batch_name"), "status": v.get("status"),
                 "total": v.get("total"), "success": (v.get("stats") or {}).get("success")}
                for k, v in reversed(snap)]
    return jsonify({"total": total, "running": running, "done": done, "accounts": accounts, "jobs": job_list})


@app.get("/ui/jobs")
def ui_jobs():
    with jobs_lock:
        snap = list(jobs.items())
    return jsonify([{"id": k, "batch_name": v.get("batch_name"), "status": v.get("status"),
                     "total": v.get("total"), "success": (v.get("stats") or {}).get("success")}
                    for k, v in reversed(snap)])


@app.get("/ui/results")
def ui_results():
    with results_lock:
        return jsonify(list(reversed(all_results)))


# ── MailSuite API endpoints ───────────────────────────────────────────────────

@app.get("/api/mailsuite/ping")
def ping():
    with jobs_lock:
        total = len(jobs)
        running = sum(1 for j in jobs.values() if j.get("status") == "running")
    return jsonify({"status": "ok", "version": "1.0", "jobs": {"total": total, "running": running}})


@app.post("/api/mailsuite/import")
def import_credentials():
    data = request.json or {}
    credentials = data.get("credentials", "")
    batch_name = data.get("batch_name", "batch")
    job_db_id = data.get("job_db_id")
    callback_url = data.get("callback_url", "")
    num_browsers = int(data.get("num_browsers", 3))

    if not credentials:
        return jsonify({"success": False, "error": "credentials requis"}), 400

    job_id = str(uuid.uuid4())[:8]
    with jobs_lock:
        jobs[job_id] = {"status": "queued", "batch_name": batch_name}

    threading.Thread(
        target=run_job,
        args=(job_id, credentials, num_browsers, callback_url, job_db_id),
        daemon=True,
    ).start()

    return jsonify({"success": True, "job_id": job_id})


@app.get("/api/mailsuite/job/<job_id>")
def job_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"success": False, "error": "Job introuvable"}), 404
    return jsonify({"success": True, "status": job.get("status"),
                    "stats": job.get("stats"), "job_id": job_id})


# ── MailSuite registration ────────────────────────────────────────────────────

def register_with_mailsuite():
    time.sleep(3)
    for _ in range(10):
        try:
            r = requests.post(f"{MAILSUITE_URL}/api/pipepass/register", json={
                "url": SELF_URL, "name": f"PipePass localhost:{PORT}",
                "version": "1.0", "public_ip": "127.0.0.1",
            }, timeout=5)
            if r.ok:
                print(f"[PipePass] Registered with MailSuite at {MAILSUITE_URL}")
                return
        except Exception:
            pass
        time.sleep(5)


def heartbeat_loop():
    while True:
        time.sleep(30)
        with jobs_lock:
            running = sum(1 for j in jobs.values() if j.get("status") == "running")
            total = len(jobs)
        try:
            requests.post(f"{MAILSUITE_URL}/api/pipepass/heartbeat", json={
                "url": SELF_URL,
                "stats": {"running_jobs": running, "total_jobs": total},
            }, timeout=5)
        except Exception:
            pass


if __name__ == "__main__":
    print(f"\n  PipePass UI:  http://localhost:{PORT}")
    print(f"  MailSuite:    {MAILSUITE_URL}\n")
    threading.Thread(target=register_with_mailsuite, daemon=True).start()
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)
