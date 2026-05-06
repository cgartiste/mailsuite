import csv
import random
import time
import re
import names
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# SETTINGS
INPUT_FILE = 'users.csv'
OUTPUT_FILE = 'changed_users.csv'
FAILED_FILE = 'failed_users.csv'
DOMAINS_FILE = 'domains.txt'
SCOPES = ['https://www.googleapis.com/auth/admin.directory.user']

# Username generator: random real names with no mailbox dependency
def generate_username():
    first = names.get_first_name().lower()
    last = names.get_last_name().lower()

    base_options = [
        f"{first}{last}",
        f"{first}",
        f"{last}",
        f"{last}{first}",
        f"{first}.{last}",
        f"{last}.{first}"
    ]

    base_username = random.choice(base_options)

    if re.search(r'\d{3,4}$', base_username):
        username = base_username
    else:
        suffix = random.randint(1000, 9999)
        username = f"{base_username}{suffix}"

    return username

# Authenticate with Google API
flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', scopes=SCOPES)
creds = flow.run_local_server(port=0)
service = build('admin', 'directory_v1', credentials=creds)

# Load users
with open(INPUT_FILE, 'r') as infile:
    users = [line.strip() for line in infile if line.strip()]

# Load domains
with open(DOMAINS_FILE, 'r') as dfile:
    domains = [line.strip() for line in dfile if line.strip()]
if not domains:
    raise Exception("No domains found in domains.txt")

# Prepare output files
open(OUTPUT_FILE, 'w').close()
open(FAILED_FILE, 'w').close()

# Process users
total_users = len(users)
updated_count = 0
failed_count = 0

for index, line in enumerate(users, start=1):
    try:
        old_email, password, recovery_key, backup_code = line.split(':')
    except ValueError:
        print(f"[{index}/{total_users}] ⚠️ Skipping malformed line: {line}")
        with open(FAILED_FILE, 'a') as failfile:
            failfile.write(line + '\n')
        failed_count += 1
        continue

    # Domain selection logic: switch every 500 users
    domain_index = (index - 1) // 500
    if domain_index >= len(domains):
        print(f"[{index}] ❌ No more domains available in domains.txt.")
        break
    current_domain = domains[domain_index]

    new_username = generate_username()
    new_email = f"{new_username}@{current_domain}"

    print(f"[{index}/{total_users}] Changing {old_email} ➔ {new_email}")

    try:
        service.users().update(
            userKey=old_email,
            body={"primaryEmail": new_email}
        ).execute()
        print(f"✅ Successfully changed {old_email} to {new_email}")

        with open(OUTPUT_FILE, 'a') as outfile:
            outfile.write(f"{new_email}:{password}:{recovery_key}:{backup_code}\n")
        updated_count += 1
    except Exception as e:
        print(f"❌ Failed to change {old_email}: {e}")
        with open(FAILED_FILE, 'a') as failfile:
            failfile.write(line + '\n')
        failed_count += 1

    # Optional: Pause to avoid hitting API rate limits
    # time.sleep(0.5)

print(f"\n✅ Finished processing.")
print(f"Total users: {total_users}")
print(f"✅ Updated: {updated_count}")
print(f"❌ Failed: {failed_count}")
print(f"Results saved to {OUTPUT_FILE} and {FAILED_FILE}")
