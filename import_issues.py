#!/usr/bin/env python3
import json
import os
import requests
import time

# Charger le fichier JSON
with open("issues.json", "r", encoding="utf-8") as f:
    data = json.load(f)

REPO = data["repo"]
API_URL = f"https://api.github.com/repos/{REPO}"
TOKEN = os.getenv("GITHUB_TOKEN")

if not TOKEN:
    print("❌ Erreur : la variable d'environnement GITHUB_TOKEN n'est pas définie.")
    print("Définis-la avec : export GITHUB_TOKEN='ton_token'")
    exit(1)

HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json"
}

def create_milestone(name, description):
    print(f"📌 Création du milestone : {name}")
    payload = {"title": name, "description": description}
    r = requests.post(f"{API_URL}/milestones", headers=HEADERS, json=payload)
    if r.status_code not in (200, 201):
        print(f"⚠️  Erreur milestone {name}: {r.text}")
    else:
        print(f"   ✔ Milestone créé")

def create_issue(title, body, labels, milestone_name):
    print(f"📝 Création issue : {title}")

    # Récupérer l'ID du milestone
    milestones = requests.get(f"{API_URL}/milestones", headers=HEADERS).json()
    milestone_id = next((m["number"] for m in milestones if m["title"] == milestone_name), None)

    payload = {
        "title": title,
        "body": body,
        "labels": labels
    }

    if milestone_id:
        payload["milestone"] = milestone_id

    r = requests.post(f"{API_URL}/issues", headers=HEADERS, json=payload)
    if r.status_code not in (200, 201):
        print(f"⚠️  Erreur issue {title}: {r.text}")
    else:
        print(f"   ✔ Issue créée")

# Import milestones
print("=== Import des milestones ===")
for m in data["milestones"]:
    create_milestone(m["name"], m["description"])
    time.sleep(0.5)

# Import issues
print("\n=== Import des issues ===")
for issue in data["issues"]:
    create_issue(issue["title"], issue["body"], issue["labels"], issue["milestone"])
    time.sleep(0.5)

print("\n🎉 Import terminé avec succès !")
