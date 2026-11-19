// Byte ranges for video files (ported from prototype-worker.js).
// Safari asks for a video in byte ranges and refuses to play it unless the server answers
// "206 Partial Content"; Workers static assets answer range requests with the whole file.
// The hero video is under 2 MB, so holding it in memory to cut a slice is fine.

export async function serveWithRanges(request: Request, assets: Fetcher): Promise<Response> {
  const range = request.headers.get("Range");
  // Fetch the whole file from the assets (without the Range header).
  const asset = await assets.fetch(new Request(request.url, { method: "GET" }));
  if (!asset.ok || !range) return withRanges(asset);

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === "" && match[2] === "")) return withRanges(asset);

  const bytes = new Uint8Array(await asset.arrayBuffer());
  const total = bytes.length;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, total - Number(match[2]));
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
  }
  if (start >= total || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }

  const headers = new Headers(asset.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  headers.set("Content-Length", String(end - start + 1));
  const body = request.method === "HEAD" ? null : bytes.slice(start, end + 1);
  return new Response(body, { status: 206, headers });
}

/** Full-file answer that also tells the browser ranges are supported. */
function withRanges(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Accept-Ranges", "bytes");
  return new Response(response.body, { status: response.status, headers });
}
