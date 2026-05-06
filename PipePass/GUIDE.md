# 📖 Guide d'Utilisation - BulkApp 2.0

## 🚀 Démarrage Rapide

### 1. Préparation des Fichiers
Assurez-vous d'avoir ces fichiers dans le répertoire:

```
credentials.txt         # Email:Password (un par ligne)
domains.txt            # Domaines (un par ligne)
users.csv              # Liste des utilisateurs
client_secret.json     # Credentials Google API
```

### 2. Format de `credentials.txt`
```
email@domain.com:password123
user2@domain.com:securepass456
user3@domain.com:anotherpass789
```

### 3. Lancer le Script
```bash
# Activer l'environnement virtuel
.\.venv\Scripts\Activate.ps1

# Lancer le script principal
python apppassword.py

# Le script demandera:
# "How many browsers do you want to launch simultaneously?"
# Entrez un nombre (ex: 5 pour 5 navigateurs en parallèle)
```

---

## 📊 Résultats

### Fichier de Sortie
**`account_details.txt`**
```
email:password:fa_secret:app_password
exemple@domain.com:pass123:ABCD1234EFGH5678:abcdefghijklmnop
```

**Colonnes:**
- `email`: Adresse email
- `password`: Mot de passe du compte
- `fa_secret`: Clé OTP (sauvegardez-la!)
- `app_password`: Mot de passe applicatif pour SMTP/IMAP

### Récupérer les Codes OTP
Pour générer les codes OTP plus tard:
```python
import pyotp

fa_secret = "ABCD1234EFGH5678"
totp = pyotp.TOTP(fa_secret)
print(totp.now())  # Code actuel
```

---

## 🔍 Dépannage

### ❌ Erreur: "App Passwords not available"
**Cause**: 2FA n'est pas activée
**Solution**: Le script l'active automatiquement

### ❌ Erreur: "Password field not found"
**Cause**: Problème avec l'authentification
**Fichier debug**: `debug_password_field.png`

### ❌ Erreur: "Could not find secret"
**Cause**: Clé OTP non trouvée
**Solution**: Vérifier la page du navigateur (screenshot sauvegardé)

### ⏳ Script est très lent
**Cause**: Trop de navigateurs en parallèle
**Solution**: Réduire le nombre (ex: 2-3 au lieu de 5)

---

## 📋 Workflow Complet

```
1. Lire credentials.txt
   ↓
2. Pour chaque compte:
   ├─ Login à Google
   ├─ Passer Captcha (NopeCHA)
   ├─ Setup 2FA (OTP)
   ├─ Créer App Password
   └─ Sauvegarder les détails
   ↓
3. Afficher résumé
```

---

## 🔐 Sécurité

### Points Importants
- ⚠️ Les mots de passe sont stockés en clair dans `credentials.txt`
- ⚠️ Ne pas partager le fichier `account_details.txt`
- ✅ Les clés OTP (fa_secret) sont essentielles - conserver les sauvegardes
- ✅ Les app passwords peuvent être régénérés depuis Google

### Recommandations
1. Utiliser un répertoire protégé
2. Chiffrer les fichiers sensibles
3. Supprimer après traitement
4. Conserver les `fa_secret` de manière sécurisée

---

## 🎯 Cas d'Usage

### Bulk Google Workspace Setup
```
1. Créer plusieurs comptes Google
2. Activer 2FA automatiquement
3. Générer les app passwords
4. Exporter pour utilisation SMTP/IMAP
```

### Migration Email
```
Utiliser les app passwords pour migrer vers:
- Clients email (Thunderbird, Outlook, etc.)
- Serveurs SMTP/IMAP
- Services d'archivage
```

### Automatisation
```
Les clés OTP permettent la génération continue:
- Authentification multi-étapes
- Systèmes de backup 2FA
- Scripts d'automatisation
```

---

## 📞 Support

### Fichiers de Debug
- `debug_after_email.png` - Après email
- `debug_password_field.png` - Erreur password

### Logs
Le script imprime les détails de chaque étape:
- ✅ Actions réussies
- ❌ Erreurs
- ⚠️ Avertissements

---

## 📈 Performances

### Estimation
- ⏱️ Par compte: 2-3 minutes
- 💻 5 navigateurs parallèles: ~30 comptes/session
- 🔄 Batch processing: intervalles de 2 secondes

### Optimisation
- Réduire les délais si le serveur est rapide
- Augmenter les navigateurs si la machine peut supporter
- Surveiller la RAM (chaque navigateur = ~150-200MB)

---

## 🔄 Intégration avec d'autres Scripts

### Après `apppassword.py`:
```
1. change.py - Modifier les utilisateurs
2. bounce.py - Vérifier les emails valides
3. create_workspace_users.py - Créer en masse
4. changeusersbydomain.py - Gérer par domaine
```

---

## 📝 Exemple Complet

```bash
# 1. Préparer les fichiers
echo "test@example.com:password123" > credentials.txt

# 2. Lancer
python apppassword.py
# Entrer: 1 (un seul navigateur pour test)

# 3. Attendre ~2-3 minutes

# 4. Vérifier résultats
cat account_details.txt
# test@example.com:password123:ABCD...EFGH:abcd...mnop

# 5. Utiliser l'app password
# Exemple: Outlook, Gmail IMAP, etc.
```

---

**Version**: 2.0
**Date**: 2026-05-02
**Support**: En cas de problème, vérifier les fichiers debug et les logs
