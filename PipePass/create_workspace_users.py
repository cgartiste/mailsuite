import csv
import random
import names
import time
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# === CONFIGURATION ===
DOMAIN = "usefee.baohsvef.onmicrosoft.com"
PASSWORD = "wahdwahd1"  # Must meet Google Workspace password policy
SCOPES = ["https://www.googleapis.com/auth/admin.directory.user"]
CLIENT_SECRET_FILE = "client_secret.json"
OUTPUT_FILE = "created_users.csv"
FAILED_FILE = "failed_users.csv"
MAX_LICENSES = 2500  # Set your Workspace license count here

# === Google Workspace Authentication ===
flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
creds = flow.run_local_server(port=0)
service = build("admin", "directory_v1", credentials=creds)

# === Count Existing Users ===
def count_existing_users(service):
    count = 0
    page_token = None
    while True:
        results = service.users().list(customer='my_customer', maxResults=500, pageToken=page_token).execute()
        users = results.get('users', [])
        count += len(users)
        page_token = results.get('nextPageToken')
        if not page_token:
            break
    return count

current_users = count_existing_users(service)
remaining_slots = MAX_LICENSES - current_users

print(f"\n📊 Current users: {current_users}")
print(f"📈 Maximum allowed: {MAX_LICENSES}")
print(f"🟢 Remaining slots: {remaining_slots}")

if remaining_slots <= 0:
    print("❌ No more users can be created. License limit reached.")
    exit()

# === Ask how many users to create ===
try:
    requested_users = int(input(f"\n🔢 How many users do you want to create? (Max: {remaining_slots}): "))
except ValueError:
    print("❌ Invalid input. Must be a number.")
    exit()

if requested_users <= 0 or requested_users > remaining_slots:
    print(f"❌ Invalid number. You can create up to {remaining_slots} users.")
    exit()

# === Init output files ===
with open(OUTPUT_FILE, "w") as f:
    f.write("email,password,first_name,last_name\n")
with open(FAILED_FILE, "w") as f:
    f.write("failed_entry\n")

# === Main loop to create users ===
for i in range(requested_users):
    first_name = names.get_first_name()
    last_name = names.get_last_name()
    random_number = f"{random.randint(100, 999)}"
    email = f"{first_name}.{last_name}@{DOMAIN}".lower()

    user_data = {
        "primaryEmail": email,
        "name": {
            "givenName": first_name,
            "familyName": last_name
        },
        "password": PASSWORD,
        "changePasswordAtNextLogin": False
    }

    print(f"[{i+1}/{requested_users}] Creating: {email}")

    try:
        service.users().insert(body=user_data).execute()
        print(f"✅ Created: {email}")
        with open(OUTPUT_FILE, "a") as out:
            out.write(f"{email},{PASSWORD}\n")
    except Exception as e:
        print(f"❌ Failed to create {email}: {e}")
        with open(FAILED_FILE, "a") as fail:
            fail.write(f"{email}\n")

print(f"\n🎯 DONE. Created users logged in '{OUTPUT_FILE}', failed in '{FAILED_FILE}'")