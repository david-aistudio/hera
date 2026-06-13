# Aider — Deep Architecture Analysis

> **Source**: [github.com/paul-gauthier/aider](https://github.com/paul-gauthier/aider)
> **Stars**: 30K+
> **Language**: Python
> **License**: Apache 2.0
> **Key Innovation**: Edit Format System, Architect Mode, Repo Map

---

## 1. Architecture Overview

Aider is the most innovative AI coding agent in terms of edit format design. Its key innovations:

1. **Edit Format System** — 6 different formats for LLM to express code changes
2. **Architect Mode** — 2 LLM collaboration (planner + editor)
3. **Repo Map** — Tree-sitter AST extraction with PageRank ranking
4. **Fuzzy Match** — Find similar code, not exact matches
5. **Git-native Patterns** — Auto-commit, undo, diff
6. **Linter Integration** — Auto-lint after edits, error feedback to LLM
7. **Reflection Loop** — Retry failed edits with error context

---

## 2. Agent Loop (base_coder.py — 2,485 lines)

### Main Loop

```python
def run(self, with_message=None, preproc=True):
    try:
        if with_message:
            self.run_one(with_message, preproc)
            return self.partial_response_content
        while True:
            user_message = self.get_input()
            self.run_one(user_message, preproc)
            self.show_undo_hint()
    except EOFError:
        return

def run_one(self, user_message, preproc):
    self.init_before_message()
    message = self.preproc_user_input(user_message)

    while message:
        self.reflected_message = None
        list(self.send_message(message))

        if not self.reflected_message:
            break

        if self.num_reflections >= self.max_reflections:
            return

        self.num_reflections += 1
        message = self.reflected_message
```

### Reflection Loop

The reflection loop is the key innovation. When an edit fails:

1. `send_message()` → LLM generates edit
2. `apply_updates()` → Try to apply edit
3. If edit fails → `self.reflected_message = error_message`
4. Loop back to `send_message()` with error context
5. LLM sees the error and tries again
6. Max 3 reflections before giving up

```python
def send_message(self, inp):
    # ... streaming and response handling ...

    # After response:
    edited = self.apply_updates()

    if edited:
        self.auto_commit(edited)

        if self.auto_lint:
            lint_errors = self.lint_edited(edited)
            if lint_errors:
                self.reflected_message = lint_errors  # Feed back to LLM
                return

    if self.auto_test:
        test_errors = self.commands.cmd_test(self.test_cmd)
        if test_errors:
            self.reflected_message = test_errors  # Feed back to LLM
```

---

## 3. Edit Format System (6 formats)

### Format 1: Edit Block (SEARCH/REPLACE)

The most popular format. LLM outputs:

```
filename.py
<<<<<<< SEARCH
def old_function():
    pass
=======
def new_function():
    return 42
>>>>>>> REPLACE
```

**Implementation** (`editblock_coder.py` — 657 lines):

```python
class EditBlockCoder(Coder):
    edit_format = "diff"

    def get_edits(self):
        content = self.partial_response_content
        edits = list(find_original_update_blocks(
            content, self.fence, self.get_inchat_relative_files()
        ))
        return edits

    def apply_edits(self, edits, dry_run=False):
        for edit in edits:
            path, original, updated = edit
            full_path = self.abs_root_path(path)
            content = self.io.read_text(full_path)
            new_content = do_replace(full_path, content, original, updated, self.fence)

            if not new_content:
                # Try other files in chat
                for full_path in self.abs_fnames:
                    content = self.io.read_text(full_path)
                    new_content = do_replace(full_path, content, original, updated, self.fence)
                    if new_content:
                        break

            if new_content:
                self.io.write_text(full_path, new_content)
```

### Matching Algorithm (3 levels)

```python
def replace_most_similar_chunk(whole, part, replace):
    # Level 1: Perfect match
    res = perfect_or_whitespace(whole_lines, part_lines, replace_lines)
    if res:
        return res

    # Level 2: Skip blank leading line
    if len(part_lines) > 2 and not part_lines[0].strip():
        res = perfect_or_whitespace(whole_lines, part_lines[1:], replace_lines)
        if res:
            return res

    # Level 3: Handle ... (elided code)
    res = try_dotdotdots(whole, part, replace)
    if res:
        return res
```

### Fuzzy Match (when exact match fails)

```python
def replace_closest_edit_distance(whole_lines, part, part_lines, replace_lines):
    similarity_thresh = 0.8
    max_similarity = 0

    for length in range(min_len, max_len):
        for i in range(len(whole_lines) - length + 1):
            chunk = whole_lines[i : i + length]
            chunk = "".join(chunk)
            similarity = SequenceMatcher(None, chunk, part).ratio()

            if similarity > max_similarity:
                max_similarity = similarity
                most_similar_chunk_start = i

    if max_similarity < similarity_thresh:
        return

    # Replace the most similar chunk
    modified_whole = (
        whole_lines[:most_similar_chunk_start]
        + replace_lines
        + whole_lines[most_similar_chunk_end:]
    )
    return "".join(modified_whole)
```

### Error Feedback

When a SEARCH/REPLACE block fails:

```python
if failed:
    res = f"# {len(failed)} SEARCH/REPLACE blocks failed to match!\n"
    for edit in failed:
        path, original, updated = edit
        content = self.io.read_text(full_path)

        # Show what went wrong
        res += f"## SearchReplaceNoExactMatch: This SEARCH block failed to exactly match lines in {path}\n"

        # Suggest similar lines
        did_you_mean = find_similar_lines(original, content)
        if did_you_mean:
            res += f"Did you mean to match some of these actual lines from {path}?\n{did_you_mean}\n"

        # Check if REPLACE is already in file
        if updated in content:
            res += f"Are you sure you need this SEARCH/REPLACE block?\nThe REPLACE lines are already in {path}!\n"

    raise ValueError(res)  # This becomes reflected_message
```

### Format 2: Whole File

LLM outputs the entire new file content.

### Format 3: Unified Diff

LLM outputs standard unified diff format.

### Format 4: Patch

LLM outputs patch format.

### Format 5: Search/Replace (function call)

LLM uses function call to specify search/replace.

### Format 6: Architect

LLM plans changes, then editor LLM executes.

---

## 4. Architect Mode (architect_coder.py — 48 lines)

The most elegant pattern in Aider. Two LLMs collaborate:

```python
class ArchitectCoder(AskCoder):
    edit_format = "architect"

    def reply_completed(self):
        content = self.partial_response_content

        # Ask user to confirm
        if not self.auto_accept_architect and not self.io.confirm_ask("Edit the files?"):
            return

        # Create editor coder with different model
        editor_model = self.main_model.editor_model or self.main_model

        kwargs = dict(
            main_model=editor_model,
            edit_format=self.main_model.editor_edit_format,
            suggest_shell_commands=False,
            map_tokens=0,
            total_cost=self.total_cost,
        )

        editor_coder = Coder.create(io=self.io, from_coder=self, **kwargs)
        editor_coder.cur_messages = []
        editor_coder.done_messages = []

        # Run editor with architect's response as input
        editor_coder.run(with_message=content, preproc=False)

        self.total_cost = editor_coder.total_cost
```

**Flow:**
1. Architect LLM plans changes (e.g., "Add error handling to function X")
2. User confirms
3. Editor LLM executes changes using edit format
4. Results are merged back

---

## 5. Repo Map (repomap.py — 867 lines)

The repo map uses **tree-sitter** to extract code structure and **PageRank** to rank importance.

### How It Works

```python
class RepoMap:
    def get_tags_raw(self, fname, rel_fname):
        # 1. Parse file with tree-sitter
        lang = filename_to_lang(fname)
        language = get_language(lang)
        parser = get_parser(lang)
        tree = parser.parse(bytes(code, "utf-8"))

        # 2. Run tree-sitter queries to find definitions and references
        query_scm = get_scm_fname(lang)
        captures = self._run_captures(Query(language, query_scm), tree.root_node)

        # 3. Extract tags (definitions and references)
        for node, tag in captures:
            if tag.startswith("name.definition."):
                kind = "def"
            elif tag.startswith("name.reference."):
                kind = "ref"

            yield Tag(rel_fname=rel_fname, fname=fname, name=node.text, kind=kind, line=node.start_point[0])
```

### PageRank Ranking

```python
def get_ranked_tags(self, chat_fnames, other_fnames, mentioned_fnames, mentioned_idents):
    # Build graph: references → definitions
    G = nx.MultiDiGraph()

    for ident in idents:
        for referencer in references[ident]:
            for definer in defines[ident]:
                # Weight based on:
                # - Number of references
                # - Whether file is in chat (50x boost)
                # - Whether ident is mentioned (10x boost)
                # - Whether ident is snake_case/camelCase (10x boost)
                # - Whether ident starts with _ (0.1x penalty)
                # - Whether ident has many definitions (0.1x penalty)
                G.add_edge(referencer, definer, weight=use_mul * num_refs, ident=ident)

    # Run PageRank
    ranked = nx.pagerank(G, weight="weight", personalization=personalization)

    # Distribute rank across edges
    ranked_definitions = defaultdict(float)
    for src in G.nodes:
        src_rank = ranked[src]
        for _src, dst, data in G.out_edges(src, data=True):
            data["rank"] = src_rank * data["weight"] / total_weight
            ranked_definitions[(dst, ident)] += data["rank"]

    # Sort by rank
    ranked_definitions = sorted(ranked_definitions.items(), reverse=True, key=lambda x: x[1])

    return ranked_tags
```

---

## 6. Linter Integration (linter.py — 304 lines)

### Auto-lint After Edits

```python
class Linter:
    def lint(self, fname, cmd=None):
        rel_fname = self.get_rel_fname(fname)
        code = Path(fname).read_text()

        if cmd:
            lintres = self.run_cmd(cmd, rel_fname, code)
        else:
            lintres = basic_lint(rel_fname, code)

        if not lintres:
            return

        # Format with tree context (show surrounding code)
        res = "# Fix any errors below, if possible.\n\n"
        res += lintres.text
        res += tree_context(rel_fname, code, lintres.lines)

        return res

    def py_lint(self, fname, rel_fname, code):
        # 3 levels of Python linting:
        basic_res = basic_lint(rel_fname, code)      # Syntax check
        compile_res = lint_python_compile(fname, code)  # Compile check
        flake_res = self.flake8_lint(rel_fname)        # Flake8 (fatal only)

        return combine_results(basic_res, compile_res, flake_res)
```

### Error Feedback Loop

```
Edit → Lint → Errors → Feed back to LLM → LLM fixes → Lint again
```

---

## 7. Git Integration (repo.py — 622 lines)

### Auto-commit

```python
class GitRepo:
    def commit(self, fnames=None, context=None, message=None, aider_edits=False, coder=None):
        # 1. Generate commit message using LLM
        if not message:
            message = self.get_commit_message(diffs, context)

        # 2. Commit
        self.repo.index.commit(message, author=author, committer=committer)

        return commit_hash, message
```

### Dirty Commit

Before editing a file, Aider commits any uncommitted changes:

```python
def check_for_dirty_commit(self, path):
    if not self.repo.is_dirty(path):
        return
    self.io.tool_output(f"Committing {path} before applying edits.")
    self.need_commit_before_edits.add(path)
```

### Undo

```python
def show_undo_hint(self):
    if self.commit_before_message[-1] != self.repo.get_head_commit_sha():
        self.io.tool_output("You can use /undo to undo and discard each aider commit.")
```

---

## 8. Model Configuration (models.py — 1,338 lines)

### Model Features

```python
class Model:
    name: str
    edit_format: str  # "diff", "whole", "udiff", "patch", "architect"
    editor_model: Model  # For architect mode
    editor_edit_format: str  # Editor's format
    max_input_tokens: int
    max_output_tokens: int
    input_cost_per_token: float
    output_cost_per_token: float
    supports_assistant_prefill: bool  # For multi-response
```

### Provider Integration

Aider uses **litellm** for provider abstraction:

```python
from aider.llm import litellm

completion = litellm.completion(
    model=model.name,
    messages=messages,
    stream=True,
    temperature=temperature,
)
```

---

## 9. Key Patterns

### Pattern 1: Edit Format as Protocol
```python
# Each edit format is a subclass
class EditBlockCoder(Coder):
    edit_format = "diff"
    def get_edits(self): ...
    def apply_edits(self, edits): ...

class WholeFileCoder(Coder):
    edit_format = "whole"
    def get_edits(self): ...
    def apply_edits(self, edits): ...
```

### Pattern 2: Reflection Loop
```python
while message:
    self.reflected_message = None
    list(self.send_message(message))

    if not self.reflected_message:
        break

    message = self.reflected_message  # Retry with error context
```

### Pattern 3: Fuzzy Matching
```python
# Try multiple strategies
def replace_most_similar_chunk(whole, part, replace):
    # 1. Perfect match
    # 2. Whitespace-flexible match
    # 3. Skip blank lines
    # 4. Handle ... (elided code)
    # 5. Fuzzy match (edit distance)
```

### Pattern 4: 2 LLM Collaboration
```python
# Architect plans
architect_response = architect_llm.chat(user_request)

# Editor executes
editor_coder = Coder.create(edit_format="diff")
editor_coder.run(with_message=architect_response)
```

### Pattern 5: Tree-sitter + PageRank
```python
# Extract code structure
tags = tree_sitter_parse(file)

# Build reference graph
G = build_graph(tags)

# Rank by importance
ranked = nx.pagerank(G)

# Generate repo map
repo_map = format_ranked_tags(ranked)
```

---

## 10. Lessons for Agent Builders

1. **Edit format matters** — Different formats work better for different models
2. **Reflection is powerful** — Let LLM see errors and retry
3. **Fuzzy matching** — LLMs make small mistakes, be forgiving
4. **Architect mode** — 2 LLMs (planner + editor) > 1 LLM
5. **Repo map** — Tree-sitter + PageRank gives LLM the right context
6. **Linter integration** — Catch errors immediately, feed back to LLM
7. **Git-native** — Auto-commit, undo, diff make workflow smooth
8. **Error messages** — Show what went wrong and suggest fixes
9. **File mentions** — Detect when LLM mentions files, offer to add them
10. **Cost tracking** — Show token usage and cost per message

---

*Last updated: 2026-06-13*
*Verified from Aider source code (Python, 30K+ stars)*
