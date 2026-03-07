<p align="center">
  <a href="README.md">English</a> | 
  <a href="README_CN.md">简体中文</a> | 
  <a href="README_FR.md">Français</a>
</p>

<h1 align="center">✨ MemeFlow</h1>

<p align="center">
  <strong>Votre lanceur de mèmes personnel. Un clic, réaction instantanée.</strong>
</p>

<p align="center">
  <a href="#fonctionnalités">Fonctionnalités</a> •
  <a href="#installation">Installation</a> •
  <a href="#pour-les-développeurs">Pour les développeurs</a> •
  <a href="#pile-technologique">Pile technologique</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-windows%20%7C%20android-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/electron-40.8-blue" alt="Electron">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## Fonctionnalités

🚀 **Ultra Rapide** — Cliquez pour copier, collez pour envoyer. Fini la recherche interminable dans les dossiers.

🎲 **Aléatoire Intelligent** — L'algorithme pondéré apprend vos préférences. Vos mèmes préférés apparaissent plus souvent.

🏷️ **Étiquettes & Catégories** — Organisez avec des étiquettes personnalisées et 4 catégories émotionnelles : Joie, Tristesse, Choc, Social.

🔍 **Recherche Rapide** — Trouvez la réaction parfaite en quelques secondes grâce aux filtres par étiquettes/catégories.

📦 **Import Facile** — Glissez-déposez des fichiers ZIP pour importer votre collection de mèmes en masse.

📱 **Multiplateforme** — Desktop (Windows) aujourd'hui, Android demain. La même expérience, partout.

⌨️ **Raccourcis Clavier** — Maintenez `Espace` pour rafraîchir automatiquement, `S` pour rechercher. Conçu pour les utilisateurs avancés.

---

## Installation

### Windows (Recommandé)

1. Téléchargez la dernière version depuis [Releases](https://github.com/sideonkeibulllll/MemeFlow/releases)
2. Exécutez l'installateur ou la version portable
3. Importez vos mèmes via ZIP ou déposez-les dans le dossier assets
4. Commencez à réagir ! 🎉

### À partir des sources

```bash
# Cloner le dépôt
git clone https://github.com/sideonkeibulllll/MemeFlow.git

# Installer les dépendances
npm install

# Exécuter en mode développement
npm start

# Construire pour Windows
npm run build:win
```

### Android

```bash
npm run build:android
# Puis ouvrez android/ dans Android Studio
```

---

## Utilisation

| Action | Résultat |
|--------|----------|
| **Clic gauche** | Copier le mème dans le presse-papiers |
| **Clic droit** | Modifier l'étiquette et la catégorie |
| **Maintenir Espace** | Rafraîchir automatiquement chaque seconde |
| **Appuyer sur S** | Ouvrir le panneau de recherche |
| **Clic Rafraîchir** | Charger de nouveaux mèmes aléatoires |

---

## Pour les développeurs

MemeFlow est conçu avec simplicité et extensibilité à l'esprit. Voici pourquoi vous pourriez vouloir contribuer ou forker :

### Architecture

```
├── main.js           # Processus principal Electron (gestionnaires IPC, opérations fichier)
├── index.html        # UI Desktop (JS vanilla, sans surcharge de framework)
├── web/              # Ressources web Capacitor pour mobile
├── android/          # Projet Android natif
└── build-web.js      # Script de build pour déploiement mobile
```

### Décisions de conception

- **Frontend sans framework** — JS vanilla pour une taille de bundle minimale et des temps de chargement instantanés
- **Stockage JSON** — Pas de base de données nécessaire, les données utilisateur restent locales et portables
- **Algorithme aléatoire pondéré** — Personnalisation simple mais efficace
- **Communication IPC** — Séparation claire entre Electron et le renderer

### Contribuer

Les contributions sont les bienvenues ! Domaines d'intérêt :

- 🐛 Corrections de bugs
- ✨ Nouvelles fonctionnalités (mode sombre, support GIF, etc.)
- 📱 Support iOS
- 🌍 Traductions

```bash
# Forkez, puis :
git checkout -b feature/amazing-feature
git commit -m "Add amazing feature"
git push origin feature/amazing-feature
# Ouvrez une Pull Request
```

---

## Pile technologique

| Couche | Technologie |
|--------|-------------|
| Desktop | Electron |
| Mobile | Capacitor |
| Frontend | JavaScript vanilla, CSS Grid |
| Build | electron-builder |
| Archive | adm-zip |

---

## Feuille de route

- [ ] Mode sombre
- [ ] Aperçu des animations GIF
- [ ] Support iOS
- [ ] Synchronisation cloud (optionnel)
- [ ] Système de plugins

---

## Licence

MIT © [sideonkeibulllll](https://github.com/sideonkeibulllll)

---

<p align="center">
  Fait avec 💖 pour les amateurs de mèmes du monde entier
</p>
