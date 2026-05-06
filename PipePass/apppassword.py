import time
import pyotp
import requests
import threading
import queue
import os
import tempfile
import shutil
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException


def read_credentials(filename):
    with open(filename, 'r') as file:
        lines = file.readlines()
    credentials = [line.strip().split(':') for line in lines]
    return credentials


def check_email_processed(file_path, search_string):
    try:
        with open(file_path, 'r') as file:
            return search_string in file.read()
    except FileNotFoundError:
        return False


def save_details(filename, email, password, fa_secret, app_password):
    with open(filename, 'a') as file:
        file.write(f"{email}:{password}:{fa_secret}:{app_password}\n")


def getCaptcha(driver):
    try:
        iframe = driver.find_elements(By.XPATH, "//iframe[@id='recaptcha-iframe']")
        if not iframe:
            return True
        
        WebDriverWait(driver, 60).until(
            EC.presence_of_element_located((By.XPATH, "//div[contains(text(),'Captcha solved')]"))
        )
        print("Captcha solved")
        time.sleep(3)
        
        submit = driver.find_elements(By.XPATH, "//button[@type='button']//span[contains(text(),'Next')]")
        if submit:
            submit[0].click()
            time.sleep(4)
    except Exception as e:
        print(f"Captcha handling: {e}")


def setup_2fa(driver):
    """Setup 2FA with integrated OTP and navigate to 2-step verification."""
    try:
        print("Starting 2FA setup...")
        
        # Navigate to sign-in options first to detect "I understand"
        driver.get("https://myaccount.google.com/signinoptions/two-step-verification")
        time.sleep(5)
        
        # Click "I understand" / "Je comprends" button
        # Primary: jsname='V67aGc' (confirmed via Chrome inspector), JS click to bypass Google interception
        _UNDERSTAND_XPATHS = [
            "//span[@jsname='V67aGc']/ancestor::button",
            "//span[contains(text(),'I understand')]/ancestor::button",
            "//span[contains(text(),'Je comprends')]/ancestor::button",
            "//button[contains(.,'I understand')]",
            "//button[contains(.,'Je comprends')]",
        ]
        for _xp in _UNDERSTAND_XPATHS:
            try:
                _btn = WebDriverWait(driver, 4).until(
                    EC.presence_of_element_located((By.XPATH, _xp))
                )
                driver.execute_script("arguments[0].scrollIntoView(true);", _btn)
                driver.execute_script("arguments[0].click();", _btn)
                print("[OK] Clicked 'I understand' / 'Je comprends'")
                time.sleep(3)
                break
            except:
                continue
        else:
            print("[!] 'I understand' not found on this page, continuing...")
        
        # Now navigate to authenticator setup
        driver.get("https://myaccount.google.com/two-step-verification/authenticator")
        time.sleep(5)

        # Check if already enabled (English or French)
        page_source = driver.page_source.lower()
        if ("turn off" in page_source or "désactiver" in page_source) and "authenticator" in page_source:
            print("[OK] 2FA already enabled")
            return "already_enabled"
        
        if "2-step verification is on" in page_source or "validation en deux étapes est activée" in page_source:
            print("[OK] 2-Step Verification is ON")
            return "already_enabled"

        # Click "Set up" / "Configurer" (English or French)
        try:
            setup_btn = WebDriverWait(driver, 15).until(
                EC.element_to_be_clickable((By.XPATH, 
                    "//span[contains(text(), 'Set up') or contains(text(), 'Configurer')]/ancestor::button"))
            )
            setup_btn.click()
            print("[OK] Clicked 'Set up' / 'Configurer'")
            time.sleep(4)
        except TimeoutException:
            print("[!] No 'Set up' button - checking state...")
            if "qr" not in page_source.lower() and "code" not in page_source.lower():
                return "already_enabled"

        # Click "Next" / "Suivant" if appears (intro screen)
        try:
            next_btn = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, 
                    "//span[contains(text(), 'Next') or contains(text(), 'Suivant')]/ancestor::button"))
            )
            next_btn.click()
            print("[OK] Clicked initial Next / Suivant")
            time.sleep(4)
        except TimeoutException:
            pass

        # Click "Can't scan it?" / "Vous ne pouvez pas le scanner ?" (English or French)
        cant_scan_selectors = [
            "//span[@jsname='V67aGc' and (contains(text(), 'Can') or contains(text(), 'scanner'))]",
            "//span[@class='mUIrbf-vQzf8d' and (contains(text(), 'Can') or contains(text(), 'scanner'))]",
            "//span[contains(text(), \"Can't scan\") or contains(text(), 'scanner')]",
            "//a[contains(text(), 'scan') or contains(text(), 'scanner')]",
            "//button[contains(text(), 'scan') or contains(text(), 'scanner')]",
            "//span[contains(text(), 'Can') and contains(text(), 'scan')]",
        ]
        
        cant_scan_clicked = False
        for selector in cant_scan_selectors:
            try:
                cant_scan = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, selector))
                )
                cant_scan.click()
                print(f"[OK] Clicked 'Can't scan it?' / 'Vous ne pouvez pas le scanner ?'")
                cant_scan_clicked = True
                time.sleep(4)
                break
            except:
                continue
        
        if not cant_scan_clicked:
            print("[ERR] ERROR: Could not click 'Can't scan it?' / 'Vous ne pouvez pas le scanner ?'")
            return None

        # Get secret key - Integrated OTP extraction
        fa_secret = None
        secret_selectors = [
            "//div/strong[string-length(text()) >= 16]",
            "//strong[string-length(text()) >= 16]",
            "//div[contains(@class, 'manual-key')]//strong",
            "//div[contains(@class, 'secret')]//strong",
        ]
        
        for selector in secret_selectors:
            try:
                elem = WebDriverWait(driver, 10).until(
                    EC.visibility_of_element_located((By.XPATH, selector))
                )
                text = elem.text.strip()
                cleaned = text.replace(" ", "").upper()
                if len(cleaned) >= 16 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' for c in cleaned):
                    fa_secret = cleaned
                    print(f"[OK] Found secret: {text} -> cleaned: {fa_secret}")
                    break
            except:
                continue
        
        # JavaScript fallback for secret extraction
        if not fa_secret:
            try:
                result = driver.execute_script("""
                    var elements = document.querySelectorAll('strong, div, span');
                    for (var i = 0; i < elements.length; i++) {
                        var text = elements[i].textContent || '';
                        var match = text.match(/([a-zA-Z0-9]{4}\\s+){7,}[a-zA-Z0-9]{4}/);
                        if (match) {
                            return match[0];
                        }
                    }
                    return '';
                """)
                if result:
                    fa_secret = result.replace(" ", "").upper()
                    print(f"[OK] Found secret via JS: {fa_secret}")
            except:
                pass
        
        if not fa_secret:
            print("[ERR] ERROR: Could not find secret")
            return None

        print(f"[OK] 2FA Secret Key (OTP): {fa_secret}")

        # Generate OTP code using integrated pyotp
        try:
            totp = pyotp.TOTP(fa_secret)
            fa_code = totp.now()
            print(f"[OK] Generated OTP Code: {fa_code}")
        except Exception as e:
            print(f"[ERR] Failed to generate OTP: {e}")
            return None

        # Click Next / Suivant using JavaScript (English or French)
        result = driver.execute_script("""
            var buttons = document.querySelectorAll('button[data-id="OCpkoe"], button[jsname="LgbsSe"]');
            for (var i = 0; i < buttons.length; i++) {
                var span = buttons[i].querySelector('span[jsname="V67aGc"]');
                if (span && (span.textContent.includes('Next') || span.textContent.includes('Suivant'))) {
                    buttons[i].click();
                    return 'Clicked Next/Suivant button';
                }
            }
            var allButtons = document.querySelectorAll('button');
            for (var i = 0; i < allButtons.length; i++) {
                if (allButtons[i].textContent.includes('Next') || allButtons[i].textContent.includes('Suivant')) {
                    allButtons[i].click();
                    return 'Clicked Next/Suivant fallback';
                }
            }
            return 'Next/Suivant button not found';
        """)
        print(f"[OK] {result}")
        time.sleep(4)

        # Enter verification code (OTP)
        code_input = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.XPATH, 
                "//input[@id='c1'] | //input[@placeholder='Enter Code' or @placeholder='Saisissez le code'] | //input[@jsname='YPqjbf']"))
        )
        code_input.clear()
        code_input.send_keys(fa_code)
        print(f"[OK] Entered OTP Code: {fa_code}")
        time.sleep(1)
        
        # Click Verify / Valider using JavaScript (English or French)
        result = driver.execute_script("""
            var buttons = document.querySelectorAll('button[data-id="dtOep"], button[jsname="LgbsSe"]');
            for (var i = 0; i < buttons.length; i++) {
                var span = buttons[i].querySelector('span[jsname="V67aGc"]');
                if (span && (span.textContent.includes('Verify') || span.textContent.includes('Valider'))) {
                    buttons[i].click();
                    return 'Clicked Verify/Valider button';
                }
            }
            var allButtons = document.querySelectorAll('button');
            for (var i = 0; i < allButtons.length; i++) {
                if (allButtons[i].textContent.includes('Verify') || allButtons[i].textContent.includes('Valider')) {
                    allButtons[i].click();
                    return 'Clicked Verify/Valider fallback';
                }
            }
            return 'Verify/Valider button not found';
        """)
        print(f"[OK] {result}")
        time.sleep(5)

        # Click "Turn on" / "Activer" link (English or French)
        result = driver.execute_script("""
            var links = document.querySelectorAll('a[aria-label="Turn on"], a[aria-label="Activer"], a[href*="twosv"]');
            for (var i = 0; i < links.length; i++) {
                var ariaLabel = links[i].getAttribute('aria-label');
                if (ariaLabel === 'Turn on' || ariaLabel === 'Activer' || links[i].textContent.includes('Turn on') || links[i].textContent.includes('Activer')) {
                    links[i].click();
                    return 'Clicked Turn on/Activer link';
                }
            }
            var allElements = document.querySelectorAll('a, button, div[role="button"]');
            for (var i = 0; i < allElements.length; i++) {
                if (allElements[i].textContent.includes('Turn on') || allElements[i].textContent.includes('Activer')) {
                    allElements[i].click();
                    return 'Clicked Turn on/Activer fallback';
                }
            }
            return 'Turn on/Activer not found';
        """)
        print(f"[OK] {result}")
        time.sleep(5)

        # Click "Turn on 2-Step Verification" / "Activer la validation en deux étapes" (English or French)
        try:
            result = driver.execute_script("""
                var buttons = document.querySelectorAll('button[jsname="Pr7Yme"], button[aria-label="Turn on 2-Step Verification"], button[aria-label="Activer la validation en deux étapes"]');
                for (var i = 0; i < buttons.length; i++) {
                    var span = buttons[i].querySelector('span[jsname="V67aGc"]');
                    if (span && (span.textContent.includes('Turn on 2-Step Verification') || span.textContent.includes('Activer'))) {
                        buttons[i].click();
                        return 'Clicked Turn on 2-Step Verification/Activer';
                    }
                }
                var allButtons = document.querySelectorAll('button');
                for (var i = 0; i < allButtons.length; i++) {
                    var ariaLabel = allButtons[i].getAttribute('aria-label');
                    if (ariaLabel && (ariaLabel.includes('Turn on 2-Step Verification') || ariaLabel.includes('Activer'))) {
                        allButtons[i].click();
                        return 'Clicked by aria-label';
                    }
                }
                return 'Turn on 2-Step Verification/Activer button not found';
            """)
            print(f"[OK] {result}")
            time.sleep(5)
        except Exception as e:
            print(f"[!] Final turn on error: {e}")

        # Verify 2FA is enabled
        driver.get("https://myaccount.google.com/two-step-verification")
        time.sleep(4)
        
        page_source = driver.page_source.lower()
        if ("turn off" in page_source or "désactiver" in page_source or 
            "2-step verification is on" in page_source or "validation en deux étapes est activée" in page_source):
            print("[OK] SUCCESS: 2FA enabled!")
            return fa_secret
        else:
            print("[!] WARNING: Could not verify 2FA, but returning secret anyway")
            return fa_secret

    except Exception as e:
        print(f"[ERR] 2FA setup error: {e}")
        import traceback
        traceback.print_exc()
        return None


def create_app_password(driver):
    """Create app password with integrated OTP support."""
    try:
        print("\n[OTP] Creating app password...")
        driver.get("https://myaccount.google.com/apppasswords")
        time.sleep(6)

        # Check if app passwords are available (English or French)
        page_source = driver.page_source.lower()
        if "not available" in page_source or "non disponible" in page_source or "unavailable" in page_source:
            print("[ERR] App Passwords not available")
            return None

        # FIXED: Use JavaScript to properly trigger React input handler
        try:
            result = driver.execute_script("""
                // Find the input field
                var input = document.getElementById('i5');
                if (!input) {
                    input = document.querySelector('input[jsname="YPqjbf"]');
                }
                if (!input) {
                    input = document.querySelector('input[type="text"]');
                }
                
                if (!input) {
                    return 'Input not found';
                }
                
                // Generate random app name
                var randomName = 'MyApp' + Math.floor(Math.random() * 10000);
                
                // Focus the input
                input.focus();
                
                // Clear existing value
                input.value = '';
                
                // Set new value
                input.value = randomName;
                
                // Trigger input event with proper detail
                var inputEvent = new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    data: randomName,
                    inputType: 'insertText'
                });
                input.dispatchEvent(inputEvent);
                
                // Also trigger keydown and keyup to simulate typing
                var keyEvent = new KeyboardEvent('keydown', {
                    bubbles: true,
                    cancelable: true,
                    key: randomName.slice(-1),
                    code: 'Key' + randomName.slice(-1).toUpperCase()
                });
                input.dispatchEvent(keyEvent);
                
                var keyUpEvent = new KeyboardEvent('keyup', {
                    bubbles: true,
                    cancelable: true,
                    key: randomName.slice(-1),
                    code: 'Key' + randomName.slice(-1).toUpperCase()
                });
                input.dispatchEvent(keyUpEvent);
                
                // Trigger change event
                var changeEvent = new Event('change', { bubbles: true });
                input.dispatchEvent(changeEvent);
                
                // Trigger blur to validate
                input.blur();
                
                // Verify value was set
                if (input.value === randomName) {
                    return 'SUCCESS: Entered ' + randomName + ', value confirmed: ' + input.value;
                } else {
                    return 'FAILED: Value not set, current: ' + input.value;
                }
            """)
            print(f"[OK] {result}")
            time.sleep(3)
            
            if "FAILED" in result or "not found" in result:
                raise Exception("Could not set input value")
            
        except Exception as e:
            print(f"[!] JavaScript input failed: {e}")
            # Fallback to Selenium with ActionChains
            try:
                from selenium.webdriver.common.action_chains import ActionChains
                
                app_name_input = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "i5"))
                )
                
                # Click to focus
                app_name_input.click()
                time.sleep(1)
                
                # Clear and type using ActionChains for better event simulation
                actions = ActionChains(driver)
                actions.click(app_name_input)
                actions.key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL)
                actions.send_keys("MyApp1234")
                actions.perform()
                
                time.sleep(1)
                
                # Tab to trigger validation
                actions = ActionChains(driver)
                actions.send_keys(Keys.TAB)
                actions.perform()
                
                print("[OK] Entered app name via ActionChains")
                time.sleep(2)
            except Exception as e2:
                print(f"[ERR] ActionChains fallback also failed: {e2}")
                return None

        # Click Create/Créer using JavaScript with retry
        max_retries = 5
        for attempt in range(max_retries):
            result = driver.execute_script("""
                // First check if input has value
                var input = document.getElementById('i5');
                var inputValue = input ? input.value : 'no input';
                
                // Find Create button
                var spans = document.querySelectorAll('span[jsname="V67aGc"]');
                for (var i = 0; i < spans.length; i++) {
                    var text = spans[i].textContent.trim();
                    if (text === 'Create' || text === 'Créer') {
                        var parent = spans[i].closest('button');
                        if (parent) {
                            if (!parent.disabled) {
                                // Scroll and click
                                parent.scrollIntoView({behavior: 'smooth', block: 'center'});
                                parent.click();
                                return 'Clicked Create/Créer (input value: ' + inputValue + ')';
                            } else {
                                return 'Create/Créer button disabled (input value: ' + inputValue + ')';
                            }
                        }
                    }
                }
                
                // Fallback by button text
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    var btnText = buttons[i].textContent.trim();
                    if ((btnText === 'Create' || btnText === 'Créer') && !buttons[i].disabled) {
                        buttons[i].scrollIntoView({behavior: 'smooth', block: 'center'});
                        buttons[i].click();
                        return 'Clicked by text fallback (input value: ' + inputValue + ')';
                    }
                }
                
                return 'Create/Créer not found (input value: ' + inputValue + ')';
            """)
            print(f"[OK] Create attempt {attempt+1}: {result}")
            
            if "Clicked" in result:
                break
            
            if "disabled" in result:
                # Try re-entering text with different method
                try:
                    driver.execute_script("""
                        var input = document.getElementById('i5');
                        if (input) {
                            // Simulate full typing sequence
                            input.focus();
                            var name = 'TestApp' + Math.floor(Math.random() * 1000);
                            
                            // Clear
                            input.value = '';
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            // Type character by character with delay simulation
                            for (var i = 0; i < name.length; i++) {
                                input.value += name[i];
                                input.dispatchEvent(new InputEvent('input', {
                                    bubbles: true,
                                    data: name[i],
                                    inputType: 'insertText'
                                }));
                            }
                            
                            input.blur();
                        }
                    """)
                except:
                    pass
            
            time.sleep(2)
        
        if "Clicked" not in result:
            print("[ERR] ERROR: Could not click Create/Créer button after retries")
            return None
            
        time.sleep(5)

        # Extract app password (integrated OTP support already validated via pyotp)
        app_password = None
        
        # Method 1: JavaScript extraction
        try:
            result = driver.execute_script("""
                // Look for password in various structures
                var selectors = [
                    'div[dir="ltr"]',
                    'strong',
                    'code',
                    'div[role="dialog"] strong',
                    'div[role="alertdialog"] strong',
                    'article strong'
                ];
                
                for (var s = 0; s < selectors.length; s++) {
                    var elements = document.querySelectorAll(selectors[s]);
                    for (var i = 0; i < elements.length; i++) {
                        var text = elements[i].textContent.replace(/\\s/g, '');
                        if (text.length === 16 && /^[a-z]+$/.test(text)) {
                            return text;
                        }
                    }
                }
                
                // Search all text for 16 lowercase letters pattern
                var bodyText = document.body.innerText;
                var match = bodyText.match(/([a-z]{4}\\s+[a-z]{4}\\s+[a-z]{4}\\s+[a-z]{4})/);
                if (match) {
                    return match[0].replace(/\\s/g, '');
                }
                
                return '';
            """)
            if result:
                app_password = result
                print(f"[OK] Found password via JS: {app_password}")
        except Exception as e:
            print(f"[!] JS extraction failed: {e}")

        if app_password:
            print(f"[OK] App Password: {app_password}")
            return app_password
        
        print("[ERR] ERROR: Could not extract app password")
        return None

    except Exception as e:
        print(f"[ERR] App password error: {e}")
        import traceback
        traceback.print_exc()
        return None

def process_account(email, password, result_queue):
    """Process a single account in a thread."""
    # Unique temp profile per thread — required for NopeCHA extension to load
    # (--guest disables extensions entirely)
    tmp_profile = tempfile.mkdtemp(prefix="bulkapp_chrome_")

    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-features=ChromeSignin")
    options.add_argument(f"--user-data-dir={tmp_profile}")

    if os.path.exists("NopeCHA.zip"):
        options.add_extension("NopeCHA.zip")
        print("[OK] NopeCHA extension loaded")
    else:
        print("[!] NopeCHA.zip not found - continuing without captcha solver")

    driver = webdriver.Chrome(options=options)
    
    try:
        print(f"\n{'='*60}")
        print(f"[*] Processing: {email}")
        print(f"{'='*60}")
        
        if check_email_processed("account_details.txt", email):
            print("[SKIP]  Already processed, skipping...")
            result_queue.put((email, "SKIPPED"))
            return

        # Configure NopeCHA — retry until extension is actually loaded
        nopecha_url = 'https://nopecha.com/setup#enabled=true&recaptcha_auto_solve=true&hcaptcha_auto_solve=true'
        for _attempt in range(4):
            driver.get(nopecha_url)
            time.sleep(3)
            if "extension is required" not in driver.page_source.lower():
                print("[OK] NopeCHA configured")
                break
            print(f"[!] NopeCHA not ready (attempt {_attempt+1}/4), waiting...")
            time.sleep(2)
        else:
            print("[!] NopeCHA could not be configured, continuing anyway...")

        driver.get("https://accounts.google.com/signin")
        time.sleep(2)

        WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='email']"))
        ).send_keys(email + Keys.ENTER)
        print(f"[OK] Entered email: {email}")
        time.sleep(3)

        getCaptcha(driver)

        # --- Handle intermediate screens that can appear before the password field ---
        print("[*] Waiting for post-email screen...")
        for _ in range(15):
            time.sleep(1)
            try:
                page = driver.page_source.lower()

                # Account picker: "Use another account" or list of accounts
                if "use another account" in page or "utiliser un autre compte" in page:
                    # Click the matching account if visible, else "Use another account"
                    try:
                        account_li = driver.find_element(
                            By.XPATH,
                            f"//div[@data-identifier='{email}'] | "
                            f"//div[contains(@aria-label, '{email}')]"
                        )
                        account_li.click()
                        print("[OK] Selected account from picker")
                    except Exception:
                        try:
                            other = driver.find_element(
                                By.XPATH,
                                "//span[contains(text(),'Use another account') or "
                                "contains(text(),'Utiliser un autre compte')]"
                            )
                            other.click()
                            print("[OK] Clicked 'Use another account'")
                            time.sleep(2)
                            # Re-enter email
                            WebDriverWait(driver, 10).until(
                                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='email']"))
                            ).send_keys(email + Keys.ENTER)
                            print(f"[OK] Re-entered email: {email}")
                        except Exception:
                            pass
                    break

                # Password field is ready
                if driver.find_elements(By.CSS_SELECTOR, "input[type='password']"):
                    print("[OK] Password field detected")
                    break

            except Exception:
                pass
        else:
            # Timed out waiting — save screenshot for debugging
            driver.save_screenshot("debug_after_email.png")
            print("[!] Timed out waiting for post-email screen. Continuing anyway...")

        time.sleep(2)

        # Enter password
        try:
            pw_field = WebDriverWait(driver, 20).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='password']"))
            )
            pw_field.send_keys(password + Keys.ENTER)
            print("[OK] Entered password")
        except TimeoutException:
            driver.save_screenshot("debug_password_field.png")
            print("[ERR] ERROR: Password field not found. Screenshot saved.")
            result_queue.put((email, "FAILED"))
            return
        time.sleep(4)

        getCaptcha(driver)
        time.sleep(3)

        # Handle all possible post-login interstitial pages
        # (speedbump, terms, workspace welcome, confirm checkbox)
        _IUNDERSTAND_XPS = [
            "//span[@jsname='V67aGc']/ancestor::button",
            "//span[contains(text(),'I understand')]/ancestor::button",
            "//span[contains(text(),'Je comprends')]/ancestor::button",
            "//button[contains(.,'I understand')]",
            "//button[contains(.,'Je comprends')]",
        ]

        print("[*] Checking for post-login interstitial pages...")
        for _wait in range(20):
            time.sleep(1)
            try:
                url = driver.current_url

                # Workspace speedbump / terms of service page
                if any(k in url for k in ("speedbump", "workspacetermsofservice", "termsofservice")):
                    print(f"[*] Speedbump page detected: {url}")
                    for xp in _IUNDERSTAND_XPS:
                        try:
                            _btn = WebDriverWait(driver, 4).until(
                                EC.presence_of_element_located((By.XPATH, xp))
                            )
                            driver.execute_script("arguments[0].scrollIntoView(true);", _btn)
                            driver.execute_script("arguments[0].click();", _btn)
                            print("[OK] Clicked speedbump 'I understand'")
                            time.sleep(4)
                            break
                        except:
                            continue
                    continue  # keep looping in case more interstitials follow

                # Old-style confirm checkbox (input#confirm)
                _chk = driver.find_elements(By.CSS_SELECTOR, "input#confirm.MK9CEd.MVpUfe")
                if _chk:
                    _chk[0].click()
                    print("[OK] Clicked confirm checkbox")
                    time.sleep(2)
                    continue

                # We reached myaccount or 2FA challenge — done with interstitials
                if any(k in url for k in ("myaccount.google.com", "/v2/challenge", "two-step-verification", "signinoptions")):
                    print("[OK] Post-login interstitials cleared")
                    break

            except Exception:
                pass

        fa_secret = setup_2fa(driver)
        if not fa_secret:
            print("[ERR] 2FA setup failed")
            result_queue.put((email, "FAILED"))
            return
        
        if fa_secret == "already_enabled":
            fa_secret = "unknown"

        app_password = create_app_password(driver)
        if app_password:
            save_details("account_details.txt", email, password, fa_secret, app_password)
            print(f"[OK] SUCCESS: {email}")
            result_queue.put((email, "SUCCESS"))
            return
        
        print("[ERR] App password creation failed")
        result_queue.put((email, "FAILED"))

    except Exception as e:
        print(f"[ERR] Error: {e}")
        import traceback
        traceback.print_exc()
        result_queue.put((email, "FAILED"))

    finally:
        driver.quit()
        shutil.rmtree(tmp_profile, ignore_errors=True)


def main():
    credentials = read_credentials("credentials.txt")
    total_accounts = len(credentials)
    
    print(f"\n{'='*60}")
    print(f"[*] Total accounts found: {total_accounts}")
    print(f"{'='*60}")
    print("[?] How many browsers do you want to launch simultaneously?")
    
    while True:
        try:
            num_browsers = int(input(f"Enter number (1-{total_accounts}): "))
            if 1 <= num_browsers <= total_accounts:
                break
            else:
                print(f"Please enter a number between 1 and {total_accounts}")
        except ValueError:
            print("Please enter a valid number")
    
    print(f"\n[*] Launching {num_browsers} browser(s) simultaneously...\n")
    
    result_queue = queue.Queue()
    threads = []
    
    # Process accounts in batches
    for i in range(0, total_accounts, num_browsers):
        batch = credentials[i:i+num_browsers]
        batch_threads = []
        
        for email, password in batch:
            thread = threading.Thread(target=process_account, args=(email, password, result_queue))
            thread.start()
            batch_threads.append(thread)
            threads.append(thread)
        
        # Wait for current batch to complete before starting next
        for thread in batch_threads:
            thread.join()
        
        print(f"\n[OK] Completed batch {i//num_browsers + 1}/{(total_accounts + num_browsers - 1)//num_browsers}")
        time.sleep(2)  # Small delay between batches
    
    # Print summary
    print(f"\n{'='*60}")
    print("[*] SUMMARY")
    print(f"{'='*60}")
    
    results = {}
    while not result_queue.empty():
        email, status = result_queue.get()
        results[email] = status
    
    success_count = 0
    failed_count = 0
    skipped_count = 0
    
    for email, password in credentials:
        status = results.get(email, "UNKNOWN")
        status_emoji = "[OK]" if status == "SUCCESS" else "[ERR]" if status == "FAILED" else "[SKIP]" if status == "SKIPPED" else "[?]"
        print(f"{status_emoji} {email}: {status}")
        
        if status == "SUCCESS":
            success_count += 1
        elif status == "FAILED":
            failed_count += 1
        elif status == "SKIPPED":
            skipped_count += 1
    
    print(f"\n{'='*60}")
    print(f"[*] Final Statistics:")
    print(f"   [OK] Success:  {success_count}")
    print(f"   [ERR] Failed:   {failed_count}")
    print(f"   [SKIP]  Skipped:  {skipped_count}")
    print(f"   [*] Total:    {total_accounts}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()