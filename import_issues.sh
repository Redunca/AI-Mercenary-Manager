#!/bin/bash

REPO="Redunca/AI-Mercenary-Manager"
YAML_FILE="issues.yaml"

echo "Import des milestones…"
yq '.milestones[]' "$YAML_FILE" | while read -r milestone; do
  NAME=$(echo "$milestone" | yq '.name')
  DESC=$(echo "$milestone" | yq '.description')
  gh milestone create "$NAME" -R "$REPO" --description "$DESC"
done

echo "Import des issues…"
yq '.issues[]' "$YAML_FILE" | while read -r issue; do
  TITLE=$(echo "$issue" | yq '.title')
  BODY=$(echo "$issue" | yq '.body')
  LABELS=$(echo "$issue" | yq '.labels | join(",")')
  MILESTONE=$(echo "$issue" | yq '.milestone')

  gh issue create -R "$REPO" \
    --title "$TITLE" \
    --body "$BODY" \
    --label "$LABELS" \
    --milestone "$MILESTONE"
done

echo "Import terminé."
