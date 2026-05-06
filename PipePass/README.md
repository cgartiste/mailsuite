# 🎯 BulkApp 2.0 - Google Workspace Account Setup Automation

**Version:** 2.0 (Améliorée)  
**Date:** 2026-05-02  
**Status:** ✅ Ready to Use

---

## 📖 Vue d'Ensemble

BulkApp 2.0 est un outil d'automatisation pour configurer en masse les comptes Google avec:
- ✅ **2FA Automatique** (Two-Step Verification)
- ✅ **OTP Intégré** (système TOTP via pyotp - sans dépendance externe)
- ✅ **App Passwords** (mots de passe applicatifs pour SMTP/IMAP)
- ✅ **Parallélisation** (plusieurs navigateurs simultanément)
- ✅ **Bilingue** (English & Français)

---

## 🚀 Démarrage Rapide

```bash
# 1. Préparer les credentials
echo "email1@domain.com:password1" > credentials.txt
echo "email2@domain.com:password2" >> credentials.txt

# 2. Lancer
python apppassword.py

# 3. Entrer le nombre de navigateurs (ex: 5)
# Le script traite tous les comptes

# 4. Résultats dans account_details.txt
cat account_details.txt
```

---

## 📁 Structure du Projet

```
bulkapp 2.0/
├── apppassword.py              ✅ Main script (amélioré)
├── change.py                   ✅ Modify users
├── bounce.py                   ✅ Email validation
├── create_workspace_users.py   ✅ Bulk create
├── changeusersbydomain.py      ✅ Domain management
├── credentials.txt             📝 Input: email:password
├── domains.txt                 📝 Domain list
├── account_details.txt         📤 Output: email:password:fa_secret:app_password
├── GUIDE.md                    📖 Usage guide
├── IMPROVEMENTS.md             📋 Changes log
└── README.md                   📄 This file
```

---

## ✨ Améliorations Principales

### 1. **Navigation Directe 2FA** 🔐
```
Avant: Chemin complexe avec plusieurs clics
Après: Navigation directe vers:
  → https://myaccount.google.com/signinoptions/two-step-verification
  → Auto-détecte "I understand" button
  → Naviguer vers authenticator
```

### 2. **OTP Intégré** 🔑
```
Avant: Dépendance externe 2fa.live
Après: Récupération + génération native avec pyotp:

  fa_secret = "ABCD1234EFGH5678"  # Base32
  totp = pyotp.TOTP(fa_secret)
  code = totp.now()               # 6 chiffres
```

### 3. **Détection "I Understand"** ✅
```
Nouveau: Clic automatique sur "I understand" / "Je comprends"
  - Sélecteurs XPath multiples
  - Fallback JavaScript
  - Gestion des erreurs gracieuse
```

### 4. **Messages Améliorés** 📊
```
Avant:  "ERROR", "SUCCESS"
Après:  ✅ SUCCESS, ❌ FAILED, ⏭️  SKIPPED, ⏳ WAITING
        + Statistiques complètes
        + Détails par étape
```

---

## 📊 Résultats Exemple

```
============================================================
📊 Total accounts found: 50
============================================================
💻 How many browsers do you want to launch simultaneously?
Enter number (1-50): 5

🚀 Launching 5 browser(s) simultaneously...

============================================================
👤 Processing: email1@domain.com
...
✓ Entered email: email1@domain.com
✓ Entered password
✓ Clicked 'I understand' / 'Je comprends' button
🔑 2FA Secret Key (OTP): ABCD1234EFGH5678
✓ Generated OTP Code: 123456
✅ SUCCESS: email1@domain.com

[... process 49 autres comptes ...]

============================================================
📋 SUMMARY
============================================================
✅ email1@domain.com: SUCCESS
✅ email2@domain.com: SUCCESS
✅ email3@domain.com: SUCCESS
...
❌ email5@domain.com: FAILED

============================================================
📊 Final Statistics:
   ✅ Success:  47
   ❌ Failed:   2
   ⏭️  Skipped:  1
   📝 Total:    50
============================================================
```

---

## 📝 Format des Fichiers

### Input: `credentials.txt`
```
email@domain.com:password123
user@domain.com:securepass456
```

### Output: `account_details.txt`
```
email@domain.com:password123:ABCD1234EFGH5678:abcdefghijklmnop
user@domain.com:securepass456:WXYZ5678IJKL1234:ijklmnopqrstuvwx
```

**Colonnes:**
- **email**: Adresse email Google
- **password**: Mot de passe du compte
- **fa_secret**: Clé OTP Base32 (essentiellement sauvegardez!)
- **app_password**: Mot de passe app 16 char (SMTP/IMAP)

---

## 🔄 Workflow Technique

```
1. Lire credentials.txt
   ↓
2. Pour chaque email:
   ├─ Login Google
   ├─ Résoudre Captcha (NopeCHA)
   ├─ Cliquer "I understand"
   ├─ Setup 2FA (Two-Step Verification)
   ├─ Récupérer clé secrète OTP
   ├─ Générer code OTP (pyotp)
   ├─ Valider le code
   ├─ Créer App Password
   └─ Sauvegarder résultats
   ↓
3. Afficher statistiques
```

---

## 🔐 Sécurité

### ⚠️ Points Importants
- Les mots de passe sont stockés en clair
- Ne pas partager `account_details.txt`
- Conserver les `fa_secret` - ils sont essentiels
- Les app passwords peuvent être régénérés

### ✅ Recommandations
1. Utiliser un répertoire protégé
2. Chiffrer les fichiers sensibles après traitement
3. Supprimer les credentials après usage
4. Sauvegarder les clés OTP à titre de backup

---

## ⚙️ Configuration

### Système Requis
- Python 3.8+
- Chrome/Chromium browser
- RAM: ~200MB par navigateur
- Internet connection stable

### Installation Dépendances
```bash
pip install -r requirements.txt

# Ou manuellement:
pip install selenium pyotp requests google-auth google-api-python-client
```

---

## 📚 Scripts Complémentaires

### `change.py`
Modifier les utilisateurs après création
```bash
python change.py
```

### `bounce.py`
Vérifier les emails valides
```bash
python bounce.py
```

### `create_workspace_users.py`
Créer les utilisateurs en masse
```bash
python create_workspace_users.py
```

### `changeusersbydomain.py`
Gérer les utilisateurs par domaine
```bash
python changeusersbydomain.py
```

---

## 🆘 Dépannage

### ❌ "App Passwords not available"
→ Le script active 2FA automatiquement

### ❌ "Password field not found"
→ Vérifier `debug_password_field.png`

### ❌ "Could not find secret"
→ Vérifier la page du navigateur

### ⏳ Script lent
→ Réduire le nombre de navigateurs (ex: 2-3)

### 🔴 Captcha non résolu
→ NopeCHA doit être activé et configuré

---

## 📈 Performance

| Configuration | Temps/Compte | Comptes/Heure |
|--------------|-------------|----------------|
| 1 navigateur | 3-4 min    | 15-20         |
| 3 navigateurs | 3-4 min    | 45-60         |
| 5 navigateurs | 3-4 min    | 75-100        |

**Note:** Temps dépend de la latence réseau et de la machine

---

## 🎯 Cas d'Usage

### Setup Workspace en Masse
```
1. Créer comptes Google
2. Activer 2FA
3. Générer app passwords
4. Exporter pour utilisation
```

### Migration Email
```
Utiliser app passwords pour:
- Thunderbird
- Outlook
- Apple Mail
- Serveurs SMTP/IMAP
```

### Automatisation Sécurisée
```
Récupérer les fa_secret pour:
- Authentification programmée
- Systèmes de backup 2FA
- Intégration avec d'autres outils
```

---

## 📞 Support & Ressources

### Fichiers Debug
- `debug_after_email.png` → Problème après email
- `debug_password_field.png` → Problème password

### Logs
Le script affiche tous les détails:
- ✅ Actions réussies
- ❌ Erreurs
- ⚠️ Avertissements

### Documentation
- `GUIDE.md` → Guide d'utilisation détaillé
- `IMPROVEMENTS.md` → Changelog des améliorations

---

## 🎓 Prochaines Étapes

1. **Test**: Vérifier sur 1-2 comptes
2. **Validation**: S'assurer que les OTP fonctionnent
3. **Production**: Lancer sur tous les comptes
4. **Monitoring**: Vérifier les résultats
5. **Intégration**: Utiliser les app passwords

---

**Questions?** Vérifier les fichiers DEBUG et les logs du script.  
**Succès!** 🎉 Votre setup automation est prêt!
