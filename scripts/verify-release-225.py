"""Verify the served TSI 2.2.5 release after deployment; read-only, no credentials."""
import hashlib
import re
import sys
import time
import urllib.parse
import urllib.request

PRODUCTION = "https://patricioontiverosdz-hue.github.io/tanabisport/"
STAGING = PRODUCTION + "staging/"
PRODUCTION_HTML = "53cfa1b527ec349a020de2646825721a2122ac1a"
STAGING_HTML = "7255cfff4249378976f779c9b12eca9736170c29"
PRODUCTION_PROJECT = "tantlgswituiwkxfgmsr"
STAGING_PROJECT = "nksqpoigywfegcbvfhoa"
# Frozen Git blob IDs from the reviewed release tree. Existing resources retain
# their main-branch blobs; only the suspension module is newly promoted.
ASSETS = {
    "assets/tsi-210-backup.js": "18ad952f463e98d07b7739ed54c0fe54d83bf6de",
    "assets/tsi-210-model.js": "f6e31e2fa5389f7caf9e7b7fad4ee1fd84f8b8e0",
    "assets/tsi-210.css": "3d89449fa98ee456bc3ebfcd9e3cf03e0168689f",
    "assets/tsi-210.js": "a0522774d0b61422426b11c0f0ba48d9e708f895",
    "assets/tsi-225-availability-suspensions.js": "f14b2336968f97f03ab6d1361c27199c27a7360b",
    "manifest.webmanifest": "f77200cac8aec8f6c3d562754600f3b8936c7cff",
    "training/editing-game-model.js": "a2eb17ecc77a284938579dd28d047e1fd9b1b274",
    "training/editing-game-renderer.js": "88d51f6062966541018b4aa1cebd553742366f1d",
    "training/editing-game.css": "a786441067dd4cbe9822384011ea7b2941b88623",
    "training/editing-game.js": "9fec79765cacf4c7b394430d4684323cc95ee69a",
    "training/game-ranking.css": "e570e28ba36ee663d9a2751dbbf4787a5c6abb17",
    "training/game-ranking.js": "d3fa97a15a8b58a89974c2ec7c1368d496c9c2eb",
    "training/photo-game-model.js": "a83a2f1802a63e58c6a6ee5da0c56abb6ecae8af",
    "training/photo-game.css": "37b52536e8214d29dc933b969f8c5d222245488d",
    "training/photo-game.js": "5283ec06fca1b2d5a484ce5082184b58f989961c",
    "tsi-push-sw.js": "80cd5bfd9b92566ad546ad4f30efd958ae69361c",
}


def fetch(url):
    query = urllib.parse.urlencode({"tsi_release_225": time.time_ns()})
    request = urllib.request.Request(url + "?" + query, headers={
        "Cache-Control": "no-cache", "Pragma": "no-cache",
        "User-Agent": "TSI-2.2.5-release-verification",
    })
    # urllib uses the system trust store and verifies HTTPS certificates.
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError(f"Unexpected HTTP status for {url}: {response.status}")
        if urllib.parse.urlsplit(response.url).scheme != "https":
            raise ValueError(f"Unexpected non-HTTPS response for {url}")
        return response.read()


def check_blob(data, expected, name):
    actual = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
    if actual != expected:
        raise ValueError(f"Git blob mismatch for {name}: expected {expected}, got {actual}")


def check_page(data, version, project, forbidden_project):
    html = data.decode("utf-8")
    if f'var APP_VERSION="{version}"' not in html:
        raise ValueError(f"Incorrect APP_VERSION: expected {version}")
    if f'var SBU="https://{project}.supabase.co"' not in html or forbidden_project in html:
        raise ValueError(f"Incorrect or mixed project configuration for {version}")
    policy = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)"', html)
    if not policy or f"connect-src https://{project}.supabase.co" not in policy.group(1):
        raise ValueError(f"Incorrect CSP for {version}")
    return html


def main():
    production = fetch(PRODUCTION)
    check_blob(production, PRODUCTION_HTML, "production/index.html")
    html = check_page(production, "2.2.5", PRODUCTION_PROJECT, STAGING_PROJECT)
    scripts = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', html)
    styles = re.findall(r'<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"', html)
    local = set()
    for source in scripts + styles:
        parsed = urllib.parse.urlsplit(source)
        if parsed.scheme or parsed.netloc:
            continue
        if source.startswith("/") or ".." in parsed.path.split("/"):
            raise ValueError(f"Unexpected local resource: {source}")
        local.add(parsed.path)
    if local != set(ASSETS) - {"manifest.webmanifest", "tsi-push-sw.js"}:
        raise ValueError("The served script/stylesheet references differ from the release manifest")
    for resource, expected in ASSETS.items():
        check_blob(fetch(PRODUCTION + resource), expected, resource)
    staging = fetch(STAGING)
    check_blob(staging, STAGING_HTML, "staging/index.html")
    check_page(staging, "2.2.5-staging", STAGING_PROJECT, PRODUCTION_PROJECT)
    print(f"TSI 2.2.5 verificada por HTTPS: HTML y {len(ASSETS)} recursos exactos; staging 2.2.5 intacto.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Falló la verificación de TSI 2.2.5: {error}", file=sys.stderr)
        sys.exit(1)
