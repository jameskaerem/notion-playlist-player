# Optional Notion Automation

The player works without automation. This setup adds automatic page-specific embeds and server-side playlist storage.

## Requirements

- A Vercel deployment
- An Upstash Redis integration connected to the Vercel project
- A Notion integration shared with the target database
- A Notion database automation that can send a webhook

## Environment variables

```text
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NOTION_TOKEN=
PUBLIC_APP_URL=https://your-project.vercel.app
WEBHOOK_SECRET=use-a-long-random-value
```

The legacy Vercel KV variable names `KV_REST_API_URL` and `KV_REST_API_TOKEN` are also supported.

## Notion automation

1. Create a database automation triggered when a page is added.
2. Add a webhook action using this URL:

```text
https://your-project.vercel.app/api/notion-webhook?secret=YOUR_WEBHOOK_SECRET
```

3. Use `POST` with a JSON body and insert the new page ID from Notion's automation variable picker:

```json
{
  "page_id": "NEW_PAGE_ID_VARIABLE"
}
```

4. Share the database with the Notion integration used by `NOTION_TOKEN`.

The webhook creates an empty server playlist and installs an embed using a URL such as:

```text
https://your-project.vercel.app/?playlist=NOTION_PAGE_ID
```

If the database template already contains the base player embed, the webhook attempts to replace that placeholder. If no placeholder exists, it appends a new embed to the page.

## Behavior

- Every Notion page receives a separate playlist.
- Playlist changes save automatically to Redis.
- The same playlist loads across browsers and devices.
- Playback position is never stored and always starts from the beginning.
- If server storage is unavailable, the player keeps a browser-local fallback.
- Without automation, the original page-specific link workflow remains available.
