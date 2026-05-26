#!/bin/bash
# Scrape a single tweet and add it to the gallery
# Usage: ./scrape-and-deploy.sh <tweet-url>

set -e

TWEET_URL="$1"

if [ -z "$TWEET_URL" ]; then
  echo "Error: No tweet URL provided"
  exit 1
fi

echo "🚀 Starting scrape for: $TWEET_URL"

# Extract tweet ID and screen name
TWEET_ID=$(echo "$TWEET_URL" | grep -oE 'status/[0-9]+' | grep -oE '[0-9]+')
SCREEN_NAME=$(echo "$TWEET_URL" | grep -oE '(x\.com|twitter\.com)/[^/]+' | cut -d'/' -f2)

if [ -z "$TWEET_ID" ]; then
  echo "Error: Could not extract tweet ID from URL"
  exit 1
fi

echo "📡 Fetching tweet data via fxtwitter API..."

# Fetch tweet data
API_URL="https://api.fxtwitter.com/${SCREEN_NAME:-i}/status/${TWEET_ID}"
TWEET_DATA=$(curl -sL "$API_URL" -H "User-Agent: Mozilla/5.0")

CODE=$(echo "$TWEET_DATA" | jq -r '.code')
if [ "$CODE" != "200" ]; then
  echo "Error: Failed to fetch tweet (code: $CODE)"
  echo "$TWEET_DATA" | jq '.'
  exit 1
fi

# Extract tweet info
AUTHOR_NAME=$(echo "$TWEET_DATA" | jq -r '.tweet.author.name // "Unknown"')
AUTHOR_HANDLE=$(echo "$TWEET_DATA" | jq -r '.tweet.author.screen_name // ""')
TWEET_TEXT=$(echo "$TWEET_DATA" | jq -r '.tweet.text // ""')
TWEET_URL_ACTUAL=$(echo "$TWEET_DATA" | jq -r '.tweet.url // "'"$TWEET_URL"'"')

echo "👤 Author: $AUTHOR_NAME (@$AUTHOR_HANDLE)"

# Get first photo URL
PHOTO_URL=$(echo "$TWEET_DATA" | jq -r '.tweet.media.photos[0].url // ""')

# Get next case ID
NEXT_ID=$(grep -oE 'case-[0-9]+' docs/gallery.md | grep -oE '[0-9]+' | sort -n | tail -1)
if [ -z "$NEXT_ID" ]; then
  NEXT_ID=0
fi
NEXT_ID=$((NEXT_ID + 1))

echo "📝 Case ID: #$NEXT_ID"

# Download image if available
IMAGE_REF=""
if [ -n "$PHOTO_URL" ]; then
  echo "🖼️  Downloading image..."
  IMAGE_FILE="case${NEXT_ID}.jpg"
  curl -sL "$PHOTO_URL" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
    -o "data/images/$IMAGE_FILE"

  # Check if file is valid (> 1KB)
  FILE_SIZE=$(wc -c < "data/images/$IMAGE_FILE" | tr -d ' ')
  if [ "$FILE_SIZE" -gt 1024 ]; then
    IMAGE_REF="../data/images/$IMAGE_FILE"
    echo "✅ Image saved: $IMAGE_FILE"
  else
    echo "⚠️  Image download failed or too small"
    rm -f "data/images/$IMAGE_FILE"
  fi
fi

# Extract title (first line of tweet, cleaned)
TITLE=$(echo "$TWEET_TEXT" | head -1 | sed 's/^[^a-zA-Z一-鿿]*//' | cut -c1-40)
if [ -z "$TITLE" ]; then
  TITLE="案例 $NEXT_ID"
fi

# Build source label
if [ -n "$AUTHOR_HANDLE" ]; then
  SOURCE_LABEL="@$AUTHOR_HANDLE"
else
  SOURCE_LABEL="社区分享"
fi

# Create markdown entry
MARKDOWN_ENTRY="
<a name=\"case-$NEXT_ID\"></a>

### 例 $NEXT_ID：$TITLE

"

if [ -n "$IMAGE_REF" ]; then
  MARKDOWN_ENTRY="${MARKDOWN_ENTRY}![$TITLE]($IMAGE_REF)
"
else
  MARKDOWN_ENTRY="${MARKDOWN_ENTRY}![$TITLE](../data/images/case${NEXT_ID}.jpg)
"
fi

MARKDOWN_ENTRY="${MARKDOWN_ENTRY}
**来源：** [$SOURCE_LABEL]($TWEET_URL_ACTUAL)

**提示词：**

\`\`\`text
$TWEET_TEXT
\`\`\`

***

"

# Insert into gallery.md before the marker
if grep -q "<!-- 在上方添加新案例" docs/gallery.md; then
  # Use awk to insert before the marker
  awk -v entry="$MARKDOWN_ENTRY" '
    /<!-- 在上方添加新案例/ { print entry }
    { print }
  ' docs/gallery.md > docs/gallery.md.tmp
  mv docs/gallery.md.tmp docs/gallery.md
  echo "✅ Added to gallery.md"
else
  # Append to end
  echo "$MARKDOWN_ENTRY" >> docs/gallery.md
  echo "✅ Appended to gallery.md"
fi

# Regenerate site data
echo "🔄 Regenerating site data..."
node scripts/generate-site-data.mjs

echo "✅ Case #$NEXT_ID added successfully!"
echo ""
echo "Summary:"
echo "  Title: $TITLE"
echo "  Author: $SOURCE_LABEL"
echo "  Image: ${IMAGE_REF:-none}"
echo "  URL: $TWEET_URL_ACTUAL"
