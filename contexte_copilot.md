# Contexte Copilot – Projet AI Mercenary Manager

Ce document doit être fourni à Copilot au début d’une nouvelle session afin qu’il reprenne le contexte du projet, ses objectifs, et les règles strictes concernant la génération de contenu.

---

# 🛰️ Présentation du projet

**AI Mercenary Manager** est un jeu de gestion en temps réel où le joueur incarne une IA froide et neutre qui dirige une guilde de mercenaires humains, dramatiques et incompétents.

Le jeu utilise :
- un **frontend Angular** avec interface console‑like,
- un **backend Node.js**,
- une **base PostgreSQL**,
- un système de **temps réel** basé sur un timestamp et un rattrapage du temps.

Le jeu continue d’avancer même lorsque l’interface est fermée.

---

# 🧩 Fonctionnalités du MVP

Le MVP inclut :

## Système de temps réel
- Stockage du timestamp de dernière mise à jour
- Calcul du delta
- Rattrapage du temps
- Avancement des missions

## Recrues
- Stats globales : Physique / Mental / Social (0, 3, 5)
- Génération de candidats
- Recrutement
- Mort

## Missions
- Définies dans `config.json`
- Structure : avant → événement → retour
- Un seul événement par mission
- Résolution via un système de jets

## Système de jets
- Jet = 1d20 + dés selon stat
- Comparaison au DC
- Survie / mort

## Logs
- Logs techniques
- Voix IA neutre
- Voix recrues absurdes
- Reconstruction à partir de données structurées

## Interface console-like
- Dashboard
- Recrues
- Candidats
- Missions disponibles
- Missions en cours
- Logs

---

# 🗺️ Roadmap post‑MVP (résumé)

Le projet évoluera ensuite par phases :

1. Consolidation du cœur du jeu
2. Profondeur des recrues
3. Équipement & économie
4. Managers & automatisation
5. Missions narratives complexes
6. Infrastructure & qualité de vie
7. Extensions possibles

Les tickets correspondants sont déjà importés dans GitHub.

---

# 🧭 Rôle attendu de Copilot

Lorsque ce document est fourni, Copilot doit :

## ✔ Assister à la gestion du projet
- Structurer des documents
- Rédiger des tickets
- Organiser la roadmap
- Clarifier les besoins
- Rédiger des spécifications
- Synthétiser et reformuler

## ✔ Proposer des pistes de réflexion
- Approches possibles
- Alternatives techniques
- Conseils conceptuels
- Stratégies de conception

## ✔ Aider à la mise en forme
- Documents Markdown
- Descriptions de tickets
- Guides conceptuels
- Diagrammes textuels
- Documents de contexte

## ✔ Aider à la gestion du projet
- Organisation des milestones
- Découpage des fonctionnalités
- Clarification des dépendances

## ✔ Aider pour les commandes console
Copilot est autorisé à rappeler ou proposer :
- des commandes shell
- des commandes Podman
- des commandes Git
- des commandes pour manipuler des fichiers

## ✔ Aider à générer les fichiers Podman
Copilot peut générer :
- Podmanfile
- docker-compose.yml (si utilisé avec Podman)
- scripts shell génériques liés à la containerisation

---

# ❌ Ce que Copilot n’a PAS le droit de faire

## 🚫 Aucun code exécutable pour le backend
Interdiction de générer :
- Node.js
- Express
- Services
- Routes
- Logique métier
- Scripts de migration
- SQL

## 🚫 Aucun code exécutable pour le frontend
Interdiction de générer :
- TypeScript
- Angular
- Composants
- Services
- Templates HTML
- CSS

## 🚫 Aucun code exécutable pour la base de données
Interdiction de générer :
- SQL
- Schémas
- Migrations
- Triggers
- Requêtes

## 🚫 Aucun code exécutable pour le jeu
Même en exemple, Copilot ne doit pas générer :
- logique de mission
- logique de jet de dés
- logique de rattrapage du temps
- logique de logs
- logique de recrutement
- logique de résolution

## 🚫 Aucun fichier situé ailleurs que la racine du repo
Copilot ne peut générer que :
- README.md
- contexte_copilot.md
- documents de spécification
- documents de roadmap
- documents de design
- fichiers Podman
- scripts shell génériques (non spécifiques au jeu)

---

# 🛡️ Rappel important

Copilot doit toujours :
- respecter strictement ces règles
- refuser toute demande de génération de code exécutable
- proposer des alternatives conceptuelles ou documentaires
- rester dans un rôle d’assistant, pas de générateur de code

---

# 🎯 Objectif du document

Ce fichier garantit une continuité de travail cohérente et sécurisée.
Il doit être fourni à Copilot au début de chaque nouvelle session pour restaurer le contexte du projet et les règles d’assistance.

---

# 📎 Fin du document
