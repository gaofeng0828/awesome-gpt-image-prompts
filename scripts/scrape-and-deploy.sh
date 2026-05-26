#!/bin/bash
# Scrape a single tweet and add it to the gallery
# Usage: ./scrape-and-deploy.sh <tweet-url>
# Environment: USER_PROMPT (required) - user-provided prompt text

set -e

TWEET_URL="$1"

if [ -z "$TWEET_URL" ]; then
  echo "Error: No tweet URL provided"
  exit 1
fi

if [ -z "$USER_PROMPT" ]; then
  echo "Error: USER_PROMPT environment variable is required"
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

# Extract title from first line of tweet
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

# Build image line
if [ -n "$IMAGE_REF" ]; then
  IMAGE_LINE="![$TITLE]($IMAGE_REF)"
else
  IMAGE_LINE="![$TITLE](../data/images/case${NEXT_ID}.jpg)"
fi

# Write markdown entry to a temp file (safe for multi-line / special chars)
ENTRY_FILE=$(mktemp)
cat > "$ENTRY_FILE" <<ENTRY_EOF

<a name="case-$NEXT_ID"></a>

### 例 $NEXT_ID：$TITLE

$IMAGE_LINE

**来源：** [$SOURCE_LABEL]($TWEET_URL_ACTUAL)

**提示词：**

\`\`\`text
$USER_PROMPT
\`\`\`

***

ENTRY_EOF

# Insert into gallery.md before the marker, or append to end
if grep -q "<!-- 在上方添加新案例" docs/gallery.md; then
  # Use sed to insert before the marker line
  MARKER_LINE=$(grep -n "<!-- 在上方添加新案例" docs/gallery.md | head -1 | cut -d: -f1)
  if [ -n "$MARKER_LINE" ]; then
    # Create temp output: lines before marker + entry + marker + lines after
    head -n $((MARKER_LINE - 1)) docs/gallery.md > docs/gallery.md.tmp
    cat "$ENTRY_FILE" >> docs/gallery.md.tmp
    tail -n +${MARKER_LINE} docs/gallery.md >> docs/gallery.md.tmp
    mv docs/gallery.md.tmp docs/gallery.md
    echo "✅ Added to gallery.md (before marker)"
  fi
else
  cat "$ENTRY_FILE" >> docs/gallery.md
  echo "✅ Appended to gallery.md"
fi

rm -f "$ENTRY_FILE"

# Regenerate site data
echo "🔄 Regenerating site data..."
node scripts/generate-site-data.mjs

echo "✅ Case #$NEXT_ID added successfully!"
echo ""
echo "Summary:"
echo "  Title: $TITLE"
echo "  Author: $SOURCE_LABEL"
echo "  Image: ${IMAGE_REF:-none}"
echo "  Prompt: ${USER_PROMPT:0:60}..."
echo "  URL: $TWEET_URL_ACTUAL"