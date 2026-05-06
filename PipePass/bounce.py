import os
import base64
import re
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

FOLDER = "service_accounts"
USER_EMAIL = "admin@yourdomain.com"

DATE_FROM = "2026/04/01"
DATE_TO   = "2026/04/23"

invalid_emails = set()

for file in os.listdir(FOLDER):
    if file.endswith(".json"):
        path = os.path.join(FOLDER, file)
        print(f"Processing: {file}")

        try:
            credentials = service_account.Credentials.from_service_account_file(
                path, scopes=SCOPES)

            delegated_creds = credentials.with_subject(USER_EMAIL)

            service = build('gmail', 'v1', credentials=delegated_creds)

            query = f'(from:mailer-daemon OR from:postmaster) ("user unknown" OR "address not found") after:{DATE_FROM} before:{DATE_TO}'

            results = service.users().messages().list(
                userId='me',
                q=query
            ).execute()

            messages = results.get('messages', [])

            for msg in messages:
                msg_data = service.users().messages().get(userId='me', id=msg['id']).execute()

                try:
                    payload = msg_data['payload']
                    parts = payload.get('parts', [])

                    for part in parts:
                        if part['mimeType'] == 'text/plain':
                            data = base64.urlsafe_b64decode(part['body']['data']).decode(errors='ignore')

                            found = re.findall(r'[\w\.-]+@[\w\.-]+', data)
                            for email in found:
                                invalid_emails.add(email)

                except:
                    pass

        except Exception as e:
            print(f"Error with {file}: {e}")

# Save results
with open('invalid_emails.txt', 'w') as f:
    for email in invalid_emails:
        f.write(email + '\n')

print(f"\n✅ TOTAL invalid emails: {len(invalid_emails)}")