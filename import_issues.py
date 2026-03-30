#!/usr/bin/env python3
import json
import os
import subprocess
import time

# Charger le fichier JSON
with open("issues_mvp.json", "r", encoding="utf-8") as f:
    data = json.load(f)

REPO = data["repo"]
API_URL = "https://api.github.com/repos/" + REPO
TOKEN = os.getenv("GITHUB_TOKEN")

if not TOKEN:
    print("❌ Erreur : la variable d'environnement GITHUB_TOKEN n'est pas définie.")
    print("Définis-la avec : export GITHUB_TOKEN='ton_token'")
    exit(1)

def run_curl(args):
    """Exécute curl et retourne la sortie."""
    process = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    out, err = process.communicate()
    return out.decode("utf-8")

def api_post(url, payload):
    return run_curl([
        "curl", "-s", "-X", "POST",
        "-H", "Authorization: token " + TOKEN,
        "-H", "Accept: application/vnd.github+json",
        "-d", json.dumps(payload),
        url
    ])

def api_get(url):
    return run_curl([
        "curl", "-s",
        "-H", "Authorization: token " + TOKEN,
        "-H", "Accept: application/vnd.github+json",
        url
    ])

def create_milestone(name, description):
    print("📌 Création du milestone :", name)
    payload = {"title": name, "description": description}
    response = api_post(API_URL + "/milestones", payload)
    print("   ↳ Réponse :", response[:200], "…")

def get_milestone_id(name):
    milestones_json = api_get(API_URL + "/milestones")
    milestones = json.loads(milestones_json)
    for m in milestones:
        if m["title"] == name:
            return m["number"]
    return None

def create_issue(title, body, labels, milestone_name):
    print("📝 Création issue :", title)

    milestone_id = get_milestone_id(milestone_name)

    payload = {
        "title": title,
        "body": body,
        "labels": labels
    }

    if milestone_id:
        payload["milestone"] = milestone_id

    response = api_post(API_URL + "/issues", payload)
    print("   ↳ Réponse :", response[:200], "…")

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
