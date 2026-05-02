#!/usr/bin/env python3
"""Experimental nodriver worker for the local OpenPeec runner.

This worker is intentionally narrow: it accepts one normalized runner config,
executes a prompt-like local page flow, writes runner artifacts, and returns a
small JSON payload for the Node runner to map into the existing result contract.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, indent=2, sort_keys=True)


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _default_artifacts_dir() -> Path:
    return _repo_root() / "runner" / "artifacts"


def _candidate_browser_paths() -> list[str]:
    return [
        os.environ.get("OPENPEEC_NODRIVER_BROWSER_PATH", ""),
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]


def _resolve_browser_path(config: dict[str, Any] | None = None) -> str | None:
    nodriver_config = (config or {}).get("browser", {}).get("nodriver", {})
    explicit = nodriver_config.get("executablePath") or nodriver_config.get(
        "browserExecutablePath"
    )
    candidates = [explicit or "", *_candidate_browser_paths()]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def _check() -> int:
    if sys.version_info < (3, 10):
        print(
            "Nodriver 0.48.1 requires Python 3.10+ in practice. "
            "Set OPENPEEC_NODRIVER_PYTHON or NODRIVER_PYTHON to a newer Python.",
            file=sys.stderr,
        )
        return 2

    try:
        import nodriver  # noqa: F401
    except Exception as exc:
        print(
            f"Nodriver is not importable: {exc}. "
            "Run `pnpm runner:install-nodriver`.",
            file=sys.stderr,
        )
        return 3

    browser_path = _resolve_browser_path()
    if not browser_path:
        print(
            "Chrome/Chromium executable was not found. Set "
            "OPENPEEC_NODRIVER_BROWSER_PATH.",
            file=sys.stderr,
        )
        return 4

    artifacts_dir = Path(
        os.environ.get("OPENPEEC_NODRIVER_ARTIFACTS_DIR", _default_artifacts_dir())
    )
    try:
        artifacts_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        print(f"Artifact directory is not writable: {exc}", file=sys.stderr)
        return 5

    print(_json({"browserPath": browser_path, "artifactsDir": str(artifacts_dir)}))
    return 0


def _selector_parts(selector: str) -> list[str]:
    parts = [part.strip() for part in str(selector or "").split(",")]
    return [part for part in parts if part]


def _selector_probe_expression(selector: str) -> str:
    return f"""
(() => {{
  const selectors = {json.dumps(_selector_parts(selector))};
  for (const raw of selectors) {{
    for (const selector of [raw, raw.replaceAll(":visible", "")]) {{
      try {{
        const node = document.querySelector(selector);
        if (node) return true;
      }} catch {{}}
    }}
  }}
  return false;
}})()
"""


def _set_prompt_expression(selector: str, text: str) -> str:
    return f"""
(() => {{
  const selectors = {json.dumps(_selector_parts(selector))};
  const text = {json.dumps(text)};
  for (const raw of selectors) {{
    for (const selector of [raw, raw.replaceAll(":visible", "")]) {{
      let node = null;
      try {{
        node = document.querySelector(selector);
      }} catch {{}}
      if (!node) continue;
      node.focus();
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {{
        node.value = text;
      }} else {{
        node.textContent = text;
      }}
      node.dispatchEvent(new InputEvent("input", {{ bubbles: true, inputType: "insertText", data: text }}));
      node.dispatchEvent(new Event("change", {{ bubbles: true }}));
      return true;
    }}
  }}
  return false;
}})()
"""


def _click_expression(selector: str) -> str:
    return f"""
(() => {{
  const selectors = {json.dumps(_selector_parts(selector))};
  for (const raw of selectors) {{
    for (const selector of [raw, raw.replaceAll(":visible", "")]) {{
      let node = null;
      try {{
        node = document.querySelector(selector);
      }} catch {{}}
      if (!node) continue;
      node.click();
      return true;
    }}
  }}
  return false;
}})()
"""


def _extract_expression(config: dict[str, Any]) -> str:
    extraction = config["extraction"]
    params = {
        "responseContainerSelector": extraction["responseContainerSelector"],
        "responseTextSelector": extraction["responseTextSelector"],
        "citationLinkSelector": extraction["citationLinkSelector"],
        "maxCitations": extraction["maxCitations"],
    }
    return f"""
(() => {{
  const params = {json.dumps(params)};
  const fallbackContainer = document.querySelector("main") || document.body;
  const explicitResponseContainer = document.querySelector(params.responseContainerSelector);
  const responseContainer = explicitResponseContainer || fallbackContainer;
  const responseContainerFound = Boolean(explicitResponseContainer);
  const responseTextNode = responseContainer.matches?.(params.responseTextSelector)
    ? responseContainer
    : (responseContainer.querySelector?.(params.responseTextSelector) || responseContainer);
  const responseText = (responseTextNode?.innerText || "").trim();
  const rawLinks = responseContainerFound
    ? Array.from(responseContainer.querySelectorAll(params.citationLinkSelector)).slice(0, params.maxCitations)
    : [];
  const citations = rawLinks.map((anchor, index) => {{
    const href = anchor.getAttribute("href") || "";
    const absoluteUrl = href ? new URL(href, window.location.href).toString() : window.location.href;
    const nearestTextContainer = anchor.closest("li, article, section, div, p") || anchor;
    return {{
      index: index + 1,
      url: absoluteUrl,
      rawTitle: ((anchor.textContent || anchor.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim()) || absoluteUrl,
      snippet: (nearestTextContainer.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 260),
    }};
  }});
  return JSON.stringify({{
    pageTitle: document.title,
    finalUrl: window.location.href,
    bodyText: document.body?.innerText || "",
    responseContainerFound,
    responseText: responseText || fallbackContainer.innerText || "",
    responseHtml: responseContainer.outerHTML || "",
    pageHtml: document.documentElement?.outerHTML || "",
    citations,
  }});
}})()
"""


async def _wait_for_selector(tab: Any, selector: str, timeout_ms: int) -> bool:
    deadline = time.monotonic() + max(timeout_ms, 0) / 1000
    while time.monotonic() < deadline:
        if await tab.evaluate(_selector_probe_expression(selector), return_by_value=True):
            return True
        await tab.sleep(0.25)
    return False


async def _run(payload: dict[str, Any]) -> dict[str, Any]:
    import nodriver as uc

    config = payload["config"]
    browser_config = config.get("browser", {})
    nodriver_config = browser_config.get("nodriver", {})
    navigation = config["navigation"]
    prompt = config["prompt"]
    timing = config["timing"]
    run_dir = Path(payload["runDir"])
    run_dir.mkdir(parents=True, exist_ok=True)

    browser_path = _resolve_browser_path(config)
    if not browser_path:
        raise RuntimeError(
            "Chrome/Chromium executable was not found for nodriver."
        )

    headless = False if payload.get("headed") else bool(browser_config.get("headless", True))
    user_data_dir = browser_config.get("userDataDir") or nodriver_config.get("userDataDir")
    browser_args = list(nodriver_config.get("browserArgs") or [])
    if nodriver_config.get("noSandbox") and "--no-sandbox" not in browser_args:
        browser_args.append("--no-sandbox")

    browser = await uc.start(
        headless=headless,
        user_data_dir=user_data_dir,
        browser_executable_path=browser_path,
        browser_args=browser_args,
        sandbox=not bool(nodriver_config.get("noSandbox")),
        lang=nodriver_config.get("lang"),
    )

    tab = None
    try:
        for hop in navigation.get("domainHops") or []:
            hop_url = hop if isinstance(hop, str) else hop.get("url")
            if not hop_url:
                continue
            try:
                tab = await browser.get(hop_url)
                await tab.sleep((hop.get("waitAfterMs", 0) if isinstance(hop, dict) else 1000) / 1000)
            except Exception:
                continue

        tab = await browser.get(payload["deeplinkUrl"])
        await tab.sleep(0.5)

        prompt_submitted = False
        if prompt.get("text"):
            ready = await _wait_for_selector(
                tab,
                prompt["inputSelector"],
                int(timing.get("promptReadyTimeoutMs") or 15000),
            )
            if not ready:
                return {
                    "status": "failed",
                    "summary": "Nodriver did not find a usable prompt input before timeout.",
                    "fallbackUsed": True,
                    "warnings": ["Prompt input selector was not found."],
                }
            if not await tab.evaluate(
                _set_prompt_expression(prompt["inputSelector"], prompt["text"]),
                return_by_value=True,
            ):
                return {
                    "status": "failed",
                    "summary": "Nodriver could not populate the prompt input.",
                    "fallbackUsed": True,
                    "warnings": ["Prompt input could not be updated."],
                }
            if prompt.get("submitSelector"):
                prompt_submitted = bool(
                    await tab.evaluate(
                        _click_expression(prompt["submitSelector"]),
                        return_by_value=True,
                    )
                )
            if not prompt_submitted:
                # Keyboard fallback for simple contenteditable or textarea flows.
                await tab.evaluate(
                    """
(() => {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
  (document.activeElement || document.body).dispatchEvent(event);
  return true;
})()
""",
                    return_by_value=True,
                )
                prompt_submitted = True

        response_ready = await _wait_for_selector(
            tab,
            config["extraction"]["responseContainerSelector"],
            int(timing.get("responseStartTimeoutMs") or timing.get("responseTimeoutMs") or 45000),
        )
        if prompt.get("text") and not response_ready:
            warnings = ["Response container was not found after prompt submission."]
            status = "failed"
            summary = "Prompt submission did not produce a usable assistant response."
            fallback_used = True
        else:
            warnings = []
            status = "success"
            summary = "Nodriver fixture run completed."
            fallback_used = False

        await tab.sleep(max(int(timing.get("settleDelayMs") or 0), 0) / 1000)
        raw_extracted = await tab.evaluate(_extract_expression(config), return_by_value=True)
        extracted = json.loads(raw_extracted)

        page_html_path = run_dir / "page.html"
        response_html_path = run_dir / "response.html"
        screenshot_path = run_dir / "page.png"
        sources_path = run_dir / "sources.json"
        network_path = run_dir / "network.json"
        console_path = run_dir / "console.json"
        result_path = run_dir / "result.json"

        page_html_path.write_text(extracted.get("pageHtml", ""), encoding="utf-8")
        response_html_path.write_text(extracted.get("responseHtml", ""), encoding="utf-8")
        sources_path.write_text(_json(extracted.get("citations", [])), encoding="utf-8")
        network_path.write_text("[]\n", encoding="utf-8")
        console_path.write_text("[]\n", encoding="utf-8")
        try:
            await tab.save_screenshot(
                filename=str(screenshot_path),
                format="png",
                full_page=True,
            )
        except Exception as exc:
            warnings.append(f"Nodriver screenshot failed: {exc}")

        result = {
            "status": status,
            "summary": summary,
            "fallbackUsed": fallback_used,
            "warnings": warnings,
            "promptSubmitted": prompt_submitted,
            "pageTitle": extracted.get("pageTitle", ""),
            "finalUrl": extracted.get("finalUrl", payload["deeplinkUrl"]),
            "bodyText": extracted.get("bodyText", ""),
            "pageHtml": extracted.get("pageHtml", ""),
            "responseText": re.sub(r"\\s+", " ", extracted.get("responseText", "")).strip(),
            "responseHtml": extracted.get("responseHtml", ""),
            "citations": extracted.get("citations", []),
            "artifacts": {
                "runDir": str(run_dir),
                "screenshot": str(screenshot_path),
                "trace": None,
                "video": None,
                "pageHtml": str(page_html_path),
                "responseHtml": str(response_html_path),
                "sources": str(sources_path),
                "network": str(network_path),
                "console": str(console_path),
                "result": str(result_path),
            },
        }
        result_path.write_text(_json(result), encoding="utf-8")
        return result
    finally:
        browser.stop()


def main() -> int:
    if "--check" in sys.argv:
        return _check()

    try:
        payload = json.loads(sys.stdin.read())
        import nodriver as uc

        result = uc.loop().run_until_complete(_run(payload))
        print(_json(result))
        return 0 if result.get("status") == "success" else 1
    except Exception as exc:
        print(
            _json(
                {
                    "status": "failed",
                    "summary": str(exc),
                    "fallbackUsed": True,
                    "warnings": ["Nodriver worker failed before completing the run."],
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
