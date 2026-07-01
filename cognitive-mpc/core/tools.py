"""Permission-gated local tools with audit-friendly results."""

from __future__ import annotations

import ast
import math
import operator
import subprocess
import uuid
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence


AuditCallback = Callable[[str, Dict[str, Any]], Any]


@dataclass
class ToolResult:
    call_id: str
    tool: str
    allowed: bool
    success: bool
    output: str = ""
    error: str = ""
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class Tool(ABC):
    """Narrow contract for local tool plugins."""

    name: str
    permission: str

    @abstractmethod
    def run(self, arguments: Mapping[str, Any], workspace: Path) -> str:
        raise NotImplementedError


class CalculatorTool(Tool):
    name = "calculator"
    permission = "calculator"

    _binary = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
    }
    _unary = {ast.UAdd: operator.pos, ast.USub: operator.neg}

    def run(self, arguments: Mapping[str, Any], workspace: Path) -> str:
        expression = str(arguments.get("expression", "")).strip()
        if not expression or len(expression) > 200:
            raise ValueError("Calculator requires an expression of at most 200 characters.")
        tree = ast.parse(expression, mode="eval")
        value = self._evaluate(tree.body)
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("Result is not finite.")
        if abs(value) > 1e100:
            raise ValueError("Result exceeds the calculator safety limit.")
        return str(value)

    def _evaluate(self, node: ast.AST) -> float | int:
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in self._binary:
            left = self._evaluate(node.left)
            right = self._evaluate(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 12:
                raise ValueError("Exponent exceeds the calculator safety limit.")
            return self._binary[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in self._unary:
            return self._unary[type(node.op)](self._evaluate(node.operand))
        raise ValueError("Expression contains an unsupported operation.")


def _safe_workspace_path(workspace: Path, requested: str) -> Path:
    root = workspace.resolve()
    target = (root / requested).resolve()
    if target != root and root not in target.parents:
        raise PermissionError("Path escapes the configured workspace.")
    return target


class NoteWriterTool(Tool):
    name = "note_writer"
    permission = "write_notes"

    def run(self, arguments: Mapping[str, Any], workspace: Path) -> str:
        relative_path = str(arguments.get("path", "notes/cognitive-mpc-notes.md"))
        content = str(arguments.get("content", "")).strip()
        if not content:
            raise ValueError("Note writer requires non-empty content.")
        if len(content) > 100_000:
            raise ValueError("Note content exceeds the 100,000-character limit.")
        target = _safe_workspace_path(workspace, relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a", encoding="utf-8") as handle:
            handle.write(content)
            handle.write("\n")
        return f"Appended {len(content)} characters to {target.relative_to(workspace.resolve())}."


class FileReaderTool(Tool):
    name = "file_reader"
    permission = "read_files"

    def run(self, arguments: Mapping[str, Any], workspace: Path) -> str:
        relative_path = str(arguments.get("path", "")).strip()
        if not relative_path:
            raise ValueError("File reader requires a path.")
        target = _safe_workspace_path(workspace, relative_path)
        if not target.is_file():
            raise FileNotFoundError(f"File not found: {relative_path}")
        max_chars = min(int(arguments.get("max_chars", 20_000)), 100_000)
        return target.read_text(encoding="utf-8")[:max_chars]


class ShellCommandTool(Tool):
    """A shell-like runner that never invokes a shell parser."""

    name = "shell"
    permission = "run_shell"

    def run(self, arguments: Mapping[str, Any], workspace: Path) -> str:
        raw_command = arguments.get("command", [])
        if not isinstance(raw_command, list):
            raise ValueError("Shell command must be an explicit argument-vector list.")
        command: Sequence[str] = [str(part) for part in raw_command]
        if not command:
            raise ValueError("Shell runner requires a command.")
        if len(command) > 64 or sum(len(part) for part in command) > 8_000:
            raise ValueError("Shell argument vector exceeds the safety limit.")
        timeout = min(float(arguments.get("timeout", 10.0)), 30.0)
        completed = subprocess.run(
            command,
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = completed.stdout
        if completed.stderr:
            output += f"\n[stderr]\n{completed.stderr}"
        if completed.returncode:
            raise RuntimeError(
                f"Command exited with {completed.returncode}: {output.strip()}"
            )
        return output.strip()


class ToolRegistry:
    """Register tools and enforce least-privilege permissions per call."""

    def __init__(
        self,
        workspace: Optional[Path | str],
        *,
        permissions: Optional[Mapping[str, bool]] = None,
        audit_callback: Optional[AuditCallback] = None,
    ) -> None:
        self.workspace = Path(workspace).expanduser().resolve() if workspace else None
        self.permissions: Dict[str, bool] = {
            "calculator": True,
            "read_files": True,
            "write_notes": False,
            "run_shell": False,
            **dict(permissions or {}),
        }
        self.audit_callback = audit_callback
        self.tools: Dict[str, Tool] = {}
        for tool in (
            CalculatorTool(),
            NoteWriterTool(),
            FileReaderTool(),
            ShellCommandTool(),
        ):
            self.register(tool)

    def configure(
        self,
        *,
        workspace: Optional[Path | str],
        shell_enabled: bool,
        read_enabled: bool = True,
        note_enabled: bool = True,
    ) -> None:
        """Apply settings without rebuilding approval records or audit hooks."""

        self.workspace = (
            Path(workspace).expanduser().resolve() if workspace else None
        )
        self.permissions.update(
            {
                "read_files": bool(read_enabled and self.workspace),
                "write_notes": bool(note_enabled and self.workspace),
                "run_shell": bool(shell_enabled and self.workspace),
            }
        )

    @staticmethod
    def model_schemas() -> List[Dict[str, Any]]:
        """Return narrow Ollama-compatible schemas for model tool proposals."""

        return [
            {
                "type": "function",
                "function": {
                    "name": "calculator",
                    "description": "Evaluate a bounded arithmetic expression.",
                    "parameters": {
                        "type": "object",
                        "properties": {"expression": {"type": "string"}},
                        "required": ["expression"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "file_reader",
                    "description": (
                        "Read a UTF-8 text file relative to the selected workspace."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "max_chars": {"type": "integer"},
                        },
                        "required": ["path"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "note_writer",
                    "description": (
                        "Append a note inside the selected workspace. Requires approval."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["path", "content"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "shell",
                    "description": (
                        "Run an exact argument-vector command in the workspace. "
                        "Requires shell to be enabled and one-time approval."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "timeout": {"type": "number"},
                        },
                        "required": ["command"],
                    },
                },
            },
        ]

    def register(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def call(self, name: str, arguments: Mapping[str, Any]) -> ToolResult:
        call_id = f"tool_{uuid.uuid4().hex[:12]}"
        tool = self.tools.get(name)
        if tool is None:
            result = ToolResult(
                call_id=call_id,
                tool=name,
                allowed=False,
                success=False,
                error=f"Unknown tool: {name}",
            )
            self._audit(result, arguments)
            return result

        allowed = bool(self.permissions.get(tool.permission, False))
        if not allowed:
            result = ToolResult(
                call_id=call_id,
                tool=name,
                allowed=False,
                success=False,
                error=f"Permission denied: {tool.permission}",
            )
            self._audit(result, arguments)
            return result

        if tool.permission in {"read_files", "write_notes", "run_shell"}:
            if self.workspace is None or not self.workspace.is_dir():
                result = ToolResult(
                    call_id=call_id,
                    tool=name,
                    allowed=False,
                    success=False,
                    error="Select an existing workspace before using file tools.",
                )
                self._audit(result, arguments)
                return result

        try:
            workspace = self.workspace or Path.cwd()
            output = tool.run(arguments, workspace)
            if len(output) > 100_000:
                output = output[:100_000] + "\n[output truncated]"
            result = ToolResult(
                call_id=call_id,
                tool=name,
                allowed=True,
                success=True,
                output=output,
            )
        except Exception as exc:  # Tools return failures; they do not crash the controller.
            result = ToolResult(
                call_id=call_id,
                tool=name,
                allowed=True,
                success=False,
                error=f"{type(exc).__name__}: {exc}",
            )
        self._audit(result, arguments)
        return result

    def _audit(self, result: ToolResult, arguments: Mapping[str, Any]) -> None:
        if self.audit_callback:
            self.audit_callback(
                "tool_call",
                {"result": result.to_dict(), "arguments": dict(arguments)},
            )
