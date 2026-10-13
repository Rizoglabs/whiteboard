#!/usr/bin/env python3
"""Deploy whiteboard to Vercel via the connector (no browser).

Usage: deploy_whiteboard.py [preview|production]
Follows the v1.0 process: upload source files (no teamId — 403 on rizoglabs
scope; team resolves from project id), then create_deployment with file refs.
package-lock.json is excluded (129KB, exceeds the 128KB CLI arg limit).
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.path.expanduser("~/workspace/whiteboard")
PROJECT_ID = "prj_tY5g24zYNyAu2bQ1dDBu9IfSdMXd"
EXCLUDE_DIRS = {"node_modules", "dist", ".git", "test-results", "playwright-report"}
EXCLUDE_FILES = {"package-lock.json"}


def collect_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fn in filenames:
            if fn in EXCLUDE_FILES:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            out.append((rel, full))
    return sorted(out)


def vercel_tool(name, args):
    cmd = ["vercel", "call-tool", "--name", name, "--arguments-json", json.dumps(args)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        print(f"TOOL {name} FAILED:\n{r.stderr[:2000]}", file=sys.stderr)
        sys.exit(1)
    return json.loads(r.stdout)


def upload_file(rel, full):
    with open(full, "rb") as f:
        data = f.read()
    sha1 = hashlib.sha1(data).hexdigest()
    b64 = base64.b64encode(data).decode()
    if len(b64) > 120_000:
        print(f"SKIP {rel}: base64 {len(b64)} bytes exceeds CLI arg budget")
        return None
    # NOTE: no teamId — it 403s on the rizoglabs scope; team resolves from project id.
    res = vercel_tool("upload_file", {
        "requestBody": b64,
        "xVercelDigest": sha1,
        "contentLength": len(data),
    })
    return {"file": rel, "sha": sha1, "size": len(data)}


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "preview"
    files = collect_files()
    print(f"uploading {len(files)} files...")
    refs = []
    for rel, full in files:
        ref = upload_file(rel, full)
        if ref:
            refs.append(ref)
        else:
            print(f"  failed: {rel}", file=sys.stderr)
            sys.exit(1)
        if len(refs) % 20 == 0:
            print(f"  {len(refs)}/{len(files)}")
    print(f"uploaded {len(refs)} files, creating deployment (target={target})...")
    body = {"project": PROJECT_ID, "files": refs, "name": "whiteboard"}
    if target == "production":
        body["target"] = "production"
    res = vercel_tool("create_deployment", {"requestBody": body, "forceNew": "1"})
    text = res["result"]["content"][0]["text"]
    dep = json.loads(text)["result"]["deployment"]
    print(f"id: {dep['id']}")
    print(f"url: {dep['url']}")
    print(f"readyState: {dep['readyState']}")
    # Poll until ready.
    for _ in range(40):
        time.sleep(15)
        g = vercel_tool("get_deployment", {"idOrUrl": dep["id"]})
        st = json.loads(g["result"]["content"][0]["text"])["result"]["deployment"]["readyState"]
        print(f"  state: {st}")
        if st in ("READY", "ERROR", "CANCELED"):
            print(f"FINAL: {st} https://{dep['url']}")
            sys.exit(0 if st == "READY" else 1)
    print("timed out waiting", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
