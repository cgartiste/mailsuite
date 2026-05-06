import csv
import csv
import csv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ========== CONFIG ==========
SERVICE_ACCOUNT_FILE = 'service-account.json'
ADMIN_EMAIL = 'admin@bimodialderham.de'

PASS_FILE = 'pass.txt'          # source file
DOMAINS_FILE = 'domain.txt'
OUTPUT_FILE = 'updated_users.csv'
NEW_PASS_FILE = 'updated_pass.txt'   # <-- new file with new emails + app passwords

USERS_PER_DOMAIN = 200          # successful users per domain

SCOPES = ['https://www.googleapis.com/auth/admin.directory.user']

# ========== AUTHENTICATE ==========
credentials = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE,
    scopes=SCOPES,
    subject=ADMIN_EMAIL
)
service = build('admin', 'directory_v1', credentials=credentials)

# ========== LOAD USERS FROM pass.txt ==========
users = []
with open(PASS_FILE, 'r', newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames or []

    # be robust if header names are weird:
    # assume:
    #   col0 = email
    #   col1 = apppassword
    #   col2 = smtp_host (if exists)
    #   col3 = smtp_port (if exists)
    email_key      = fieldnames[0] if len(fieldnames) > 0 else 'email'
    apppass_key    = fieldnames[1] if len(fieldnames) > 1 else 'apppassword'
    smtp_host_key  = fieldnames[2] if len(fieldnames) > 2 else 'smtp_host'
    smtp_port_key  = fieldnames[3] if len(fieldnames) > 3 else 'smtp_port'

    for row in reader:
        email = row.get(email_key, '').strip()
        if not email:
            continue
        users.append({
            'email': email,
            'apppassword': row.get(apppass_key, '').strip(),
            'smtp_host': row.get(smtp_host_key, '').strip(),
            'smtp_port': row.get(smtp_port_key, '').strip(),
        })

total_users = len(users)
print(f"Loaded {total_users} users from {PASS_FILE}")

# ========== LOAD DOMAINS ==========
with open(DOMAINS_FILE, 'r', encoding='utf-8') as f:
    domains = [line.strip() for line in f if line.strip()]

if not domains:
    raise RuntimeError("No domains found in domain.txt")

print(f"Loaded {len(domains)} domains from {DOMAINS_FILE}")

# ========== HELPER: FIND USER BY PRIMARY OR ALIAS ==========
def find_user_by_email_or_alias(raw_email):
    """
    1) Try to get user by primary email (exact).
    2) If 404, try to find by alias/local part using users().list query=email:<username>.
    Returns (user_dict, found_via) or (None, 'not_found')
    found_via: 'primary' or 'alias'
    """
    try:
        user = service.users().get(userKey=raw_email).execute()
        return user, 'primary'
    except HttpError as e:
        status = int(e.resp.status) if hasattr(e, "resp") and hasattr(e.resp, "status") else None
        if status != 404:
            # other error -> bubble up
            raise

        # if 404 -> try alias search
        if '@' in raw_email:
            username, _ = raw_email.split('@', 1)
        else:
            username = raw_email

        search_query = f"email:{username}"
        resp = service.users().list(
            customer='my_customer',
            query=search_query,
            maxResults=5
        ).execute()

        found_users = resp.get('users', [])
        if not found_users:
            return None, 'not_found'

        return found_users[0], 'alias'
    except Exception:
        raise


# ========== PROCESS USERS & DOMAINS ==========
user_index = 0

with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as out_csv, \
     open(NEW_PASS_FILE, 'w', newline='', encoding='utf-8') as new_pass_csv:

    # log for all user actions
    user_fieldnames = [
        'username',
        'requested_email',
        'old_email',
        'new_email',
        'status',
        'found_via',
        'all_emails',
        'error'
    ]
    user_writer = csv.DictWriter(out_csv, fieldnames=user_fieldnames)
    user_writer.writeheader()

    # file with updated credentials mapping
    cred_fieldnames = ['email', 'apppassword', 'smtp_host', 'smtp_port']
    cred_writer = csv.DictWriter(new_pass_csv, fieldnames=cred_fieldnames)
    cred_writer.writeheader()

    for domain in domains:
        if user_index >= total_users:
            print("\nNo more users left. Stopping.")
            break

        print(f"\n🌐 Processing domain: {domain}")

        success_for_this_domain = 0

        while success_for_this_domain < USERS_PER_DOMAIN and user_index < total_users:
            u = users[user_index]
            raw_email = u['email'].strip()
            requested_email = raw_email
            user_index += 1

            if '@' not in raw_email:
                print(f"[{user_index}/{total_users}] ⚠️ Invalid email format: {raw_email}", flush=True)
                user_writer.writerow({
                    'username': raw_email,
                    'requested_email': requested_email,
                    'old_email': '',
                    'new_email': '',
                    'status': 'invalid_email',
                    'found_via': '',
                    'all_emails': '',
                    'error': 'Invalid email format'
                })
                continue

            username, _ = raw_email.split('@', 1)

            # 1) Find user by primary or alias
            try:
                user, found_via = find_user_by_email_or_alias(raw_email)
            except HttpError as e:
                print(f"[{user_index}/{total_users}] ❌ Error checking user {raw_email}: {e}", flush=True)
                user_writer.writerow({
                    'username': username,
                    'requested_email': requested_email,
                    'old_email': '',
                    'new_email': f"{username}@{domain}",
                    'status': 'check_failed',
                    'found_via': '',
                    'all_emails': '',
                    'error': str(e)
                })
                continue
            except Exception as e:
                print(f"[{user_index}/{total_users}] ❌ Unexpected error checking user {raw_email}: {e}", flush=True)
                user_writer.writerow({
                    'username': username,
                    'requested_email': requested_email,
                    'old_email': '',
                    'new_email': f"{username}@{domain}",
                    'status': 'check_failed',
                    'found_via': '',
                    'all_emails': '',
                    'error': str(e)
                })
                continue

            if not user:
                print(f"[{user_index}/{total_users}] ⚠️ User not found (primary or alias): {raw_email}", flush=True)
                user_writer.writerow({
                    'username': username,
                    'requested_email': requested_email,
                    'old_email': '',
                    'new_email': f"{username}@{domain}",
                    'status': 'not_found',
                    'found_via': 'none',
                    'all_emails': '',
                    'error': 'Workspace user not found (primary or alias)'
                })
                continue

            primary_email = user.get('primaryEmail', '')
            aliases = user.get('aliases', [])
            all_emails_list = [primary_email] + aliases if aliases else [primary_email]
            all_emails_str = ','.join(all_emails_list)

            old_email = primary_email
            new_email = f"{username}@{domain}"

            # If already on this domain, log but don't write to NEW_PASS_FILE
            if old_email.lower() == new_email.lower():
                print(
                    f"[{user_index}/{total_users}] ℹ️ Already on domain ({found_via}): {old_email} | aliases: {all_emails_str}",
                    flush=True
                )
                user_writer.writerow({
                    'username': username,
                    'requested_email': requested_email,
                    'old_email': old_email,
                    'new_email': new_email,
                    'status': 'already_on_domain',
                    'found_via': found_via,
                    'all_emails': all_emails_str,
                    'error': ''
                })
                success_for_this_domain += 1
                continue

            # 2) Update primary email to new domain
            try:
                service.users().update(
                    userKey=old_email,
                    body={"primaryEmail": new_email}
                ).execute()

                success_for_this_domain += 1

                print(
                    f"[{user_index}/{total_users}] ✅ ({success_for_this_domain}/{USERS_PER_DOMAIN} for {domain}) "
                    f"{old_email} → {new_email} (found_via={found_via}) | aliases: {all_emails_str}",
                    flush=True
                )

                user_writer.writerow({
                    'username': username,
                    'requested_email': requested_email,
                    'old_email': old_email,
                    'new_email': new_email,
                    'status': 'success',
                    'found_via': found_via,
                    'all_emails': all_emails_str,
                    'error': ''
                })

                # === NEW PART: write updated credentials row ===
                cred_writer.writerow({
                    'email': new_email,
                    'apppassword': u['apppassword'],
                    'smtp_host': u['smtp_host'],
                    'smtp_port': u['smtp_port'],
                })

            except Exception as e:
                print(
                    f"[{user_index}/{total_users}] ❌ Failed to update {old_email} → {new_email}: {e}",
                    flush=True
                )
                user_writer.writerow({
                    'username': username,
                    'requested_email': requested_email,
                    'old_email': old_email,
                    'new_email': new_email,
                    'status': 'update_failed',
                    'found_via': found_via,
                    'all_emails': all_emails_str,
                    'error': str(e)
                })
                # no write to NEW_PASS_FILE

        print(f"✅ Finished domain {domain}: {success_for_this_domain} successful users.\n", flush=True)

print("🎉 All done.")
print(" - User log:      ", OUTPUT_FILE)
print(" - New pass file: ", NEW_PASS_FILE)