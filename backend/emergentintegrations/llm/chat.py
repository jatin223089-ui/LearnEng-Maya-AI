"""Gemini chat client compatible with the original emergentintegrations API."""

from __future__ import annotations

import os
from dataclasses import dataclass

from google import genai
from google.genai import types


class QuotaExceededError(RuntimeError):
    """Raised when Gemini API quota is exhausted."""


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "429" in msg
        or "resource_exhausted" in msg
        or "quota exceeded" in msg
        or "quota" in msg and "exceeded" in msg
    )


@dataclass
class UserMessage:
    text: str


class LlmChat:
    def __init__(self, api_key: str, session_id: str, system_message: str):
        self._fallback_key = api_key
        self._session_id = session_id
        self._system_message = system_message
        self._provider = "gemini"
        self._model = "gemini-2.0-flash"

    def with_model(self, provider: str, model: str) -> "LlmChat":
        self._provider = provider
        self._model = model
        return self

    def _gemini_api_key(self) -> str:
        key = os.environ.get("GOOGLE_API_KEY", "").strip()
        if key:
            return key
        if self._fallback_key and not self._fallback_key.startswith("sk-emergent"):
            return self._fallback_key
        raise ValueError(
            "GOOGLE_API_KEY is required for Gemini. "
            "Get one at https://aistudio.google.com/apikey"
        )

    async def send_message(self, message: UserMessage) -> str:
        if self._provider != "gemini":
            raise ValueError(f"Local shim supports gemini only, got: {self._provider}")

        client = genai.Client(api_key=self._gemini_api_key())
        # Prefer Gemini 3 Flash only; avoid older models that may hit separate free-tier quotas.
        models_to_try = []
        for candidate in (
            self._model,
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash-lite",
            "gemini-2.0-flash",
        ):
            if candidate and candidate not in models_to_try:
                models_to_try.append(candidate)

        last_err = None
        response = None
        for model_name in models_to_try:
            try:
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=message.text,
                    config=types.GenerateContentConfig(
                        system_instruction=self._system_message
                    ),
                )
                break
            except Exception as exc:
                last_err = exc
        if response is None:
            if last_err and _is_quota_error(last_err):
                raise QuotaExceededError(str(last_err)) from last_err
            raise last_err or RuntimeError("Gemini request failed")
        text = getattr(response, "text", None)
        if text:
            return text
        if response.candidates:
            parts = response.candidates[0].content.parts
            return "".join(getattr(p, "text", "") or "" for p in parts)
        return ""
