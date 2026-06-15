#!/bin/bash
# Hera — AI Coding Agent Architecture Reference
# One-liner install: curl -sSL https://raw.githubusercontent.com/ahmdd4vd/hera/main/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/ahmdd4vd/hera.git"
RAW_URL="https://raw.githubusercontent.com/ahmdd4vd/hera/main"
TEMP_DIR=$(mktemp -d)
# Clean up TEMP_DIR on exit (success or failure)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Flags
AUTO_YES=false
COMMAND="install"
VERSION_TAG="main"

print_banner() {
    echo -e "${BLUE}"
    echo "  ╔═══════════════════════════════════════╗"
    echo "  ║           🏛 Hera Installer           ║"
    echo "  ║   AI Coding Agent Architecture Ref    ║"
    echo "  ╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }
print_info()    { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }

# ============================================================================
# Parse arguments
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -y|--yes)
                AUTO_YES=true
                shift
                ;;
            --version-tag)
                if [[ -z "${2:-}" || "$2" == -* ]]; then
                    print_error "--version-tag requires a value (e.g., --version-tag v2.10.0)"
                    exit 1
                fi
                VERSION_TAG="$2"
                RAW_URL="https://raw.githubusercontent.com/ahmdd4vd/hera/${VERSION_TAG}"
                shift 2
                ;;
            uninstall)
                COMMAND="uninstall"
                shift
                ;;
            list)
                COMMAND="list"
                shift
                ;;
            -h|--help)
                COMMAND="help"
                shift
                ;;
            *)
                # Agent name or "all"
                AGENT_ARG="$1"
                shift
                ;;
        esac
    done
}

# ============================================================================
# Auto-detect which agents the user has
#
# CRITICAL FIX: Previous version detected agents in order and returned
# the first match. This caused mismatches when:
#   1. Multiple agents had markers (e.g., .opencode AND .claude)
#   2. No agent markers existed yet (first-time install)
#
# New approach: Score each agent, show all detected agents,
# and let the user choose when there are multiple matches.
# ============================================================================

detect_agents() {
    local -a detected_keys=()
    local -a detected_names=()
    local -a detected_scores=()

    # Claude Code — highest priority, specific markers
    local score=0
    [ -f "CLAUDE.md" ] && ((score+=2))
    [ -d ".claude" ] && ((score+=2))
    command -v claude &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("claude")
        detected_names+=("Claude Code")
        detected_scores+=("$score")
    fi

    # Hermes Agent — specific home directory markers
    score=0
    [ -d "$HOME/.hermes" ] && ((score+=1))
    [ -f "$HOME/.hermes/config.yaml" ] && ((score+=2))
    command -v hermes &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("hermes")
        detected_names+=("Hermes Agent")
        detected_scores+=("$score")
    fi

    # Cursor — specific project markers
    score=0
    [ -d ".cursor" ] && ((score+=2))
    [ -f ".cursorrules" ] && ((score+=2))
    command -v cursor &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("cursor")
        detected_names+=("Cursor")
        detected_scores+=("$score")
    fi

    # Kilo Code — specific project markers
    score=0
    [ -d ".kilo" ] && ((score+=2))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("kilo")
        detected_names+=("Kilo Code")
        detected_scores+=("$score")
    fi

    # Kiro — specific project markers
    score=0
    [ -d ".kiro" ] && ((score+=2))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("kiro")
        detected_names+=("Kiro")
        detected_scores+=("$score")
    fi

    # Antigravity — specific project markers
    score=0
    [ -d ".agents" ] && ((score+=2))
    command -v antigravity &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("antigravity")
        detected_names+=("Google Antigravity")
        detected_scores+=("$score")
    fi

    # Aider — specific project markers
    score=0
    [ -f ".aider.conf.yml" ] && ((score+=2))
    [ -d ".aider" ] && ((score+=2))
    command -v aider &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("aider")
        detected_names+=("Aider")
        detected_scores+=("$score")
    fi

    # Gemini — specific markers
    score=0
    [ -f "GEMINI.md" ] && ((score+=2))
    [ -d ".gemini" ] && ((score+=2))
    command -v gemini &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("gemini")
        detected_names+=("Gemini CLI")
        detected_scores+=("$score")
    fi

    # OpenCode — specific markers
    score=0
    [ -f "opencode.json" ] && ((score+=2))
    [ -d ".opencode" ] && ((score+=2))
    command -v opencode &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("opencode")
        detected_names+=("OpenCode")
        detected_scores+=("$score")
    fi

    # Codex — specific markers
    score=0
    [ -f "codex.json" ] && ((score+=2))
    [ -d ".codex" ] && ((score+=2))
    command -v codex &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("codex")
        detected_names+=("Codex")
        detected_scores+=("$score")
    fi

    # Pi — specific home directory markers
    score=0
    [ -d "$HOME/.pi" ] && ((score+=1))
    command -v pi &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("pi")
        detected_names+=("Pi coding agent")
        detected_scores+=("$score")
    fi

    # Copilot — specific home directory markers
    score=0
    [ -d "$HOME/.copilot" ] && ((score+=1))
    command -v copilot &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("copilot")
        detected_names+=("GitHub Copilot CLI")
        detected_scores+=("$score")
    fi

    # Devin — specific home directory markers
    score=0
    [ -d "$HOME/.config/devin" ] && ((score+=1))
    command -v devin &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("devin")
        detected_names+=("Devin CLI")
        detected_scores+=("$score")
    fi

    # CodeBuddy — specific markers
    score=0
    [ -f "CODEBUDDY.md" ] && ((score+=2))
    [ -d ".codebuddy" ] && ((score+=2))
    command -v codebuddy &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("codebuddy")
        detected_names+=("CodeBuddy")
        detected_scores+=("$score")
    fi

    # Amp — specific markers
    score=0
    [ -f "amp.json" ] && ((score+=2))
    [ -d ".amp" ] && ((score+=2))
    command -v amp &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("amp")
        detected_names+=("Amp")
        detected_scores+=("$score")
    fi

    # Trae — specific markers
    score=0
    [ -f "trae.json" ] && ((score+=2))
    [ -d ".trae" ] && ((score+=2))
    command -v trae &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("trae")
        detected_names+=("Trae")
        detected_scores+=("$score")
    fi

    # OpenClaw — specific markers (enhanced: added config file + home dir)
    score=0
    [ -f "claw.json" ] && ((score+=2))
    [ -f ".claw/config.json" ] && ((score+=2))
    [ -d ".claw" ] && ((score+=2))
    [ -d "$HOME/.claw" ] && ((score+=1))
    command -v claw &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("claw")
        detected_names+=("OpenClaw")
        detected_scores+=("$score")
    fi

    # Factory Droid — specific markers (enhanced: added config file + home dir)
    score=0
    [ -f "droid.json" ] && ((score+=2))
    [ -f ".droid/config.json" ] && ((score+=2))
    [ -d ".droid" ] && ((score+=2))
    [ -d "$HOME/.droid" ] && ((score+=1))
    command -v droid &>/dev/null && ((score+=3))
    if [ "$score" -gt 0 ]; then
        detected_keys+=("droid")
        detected_names+=("Factory Droid")
        detected_scores+=("$score")
    fi

    # Output: keys|names|scores
    local IFS='|'
    echo "${detected_keys[*]}|${detected_names[*]}|${detected_scores[*]}"
}

# Download file from GitHub (with status code + content validation)
download_file() {
    local file_path="$1"
    local target_path="$2"
    local http_code
    http_code=$(curl -fsSL -w "%{http_code}" -o "$target_path" "${RAW_URL}/${file_path}" 2>/dev/null) || {
        print_error "Failed to download ${file_path}"
        return 1
    }
    if [ "$http_code" != "200" ]; then
        rm -f "$target_path"
        print_error "HTTP ${http_code} for ${file_path}"
        return 1
    fi

    # Validate content: must not be HTML error page, must have reasonable size
    local file_size
    file_size=$(wc -c < "$target_path" 2>/dev/null || echo 0)
    if [ "$file_size" -lt 50 ]; then
        rm -f "$target_path"
        print_error "Downloaded ${file_path} is too small (${file_size} bytes) — may be an error page"
        return 1
    fi

    # Check first line is not HTML
    local first_line
    first_line=$(head -1 "$target_path" 2>/dev/null || echo "")
    if [[ "$first_line" =~ ^\<!DOCTYPE || "$first_line" =~ ^\<html || "$first_line" =~ ^\<head ]]; then
        rm -f "$target_path"
        print_error "Downloaded ${file_path} appears to be an HTML error page"
        return 1
    fi
}

# Check if AGENTS.md has a conflict with another sharing agent
check_agents_md_conflict() {
    local agent="$1"
    local agents_md_sharing="opencode codex aider amp trae claw droid"

    # Only check for agents that share AGENTS.md
    if ! echo "$agents_md_sharing" | grep -qw "$agent"; then
        return 1  # No conflict possible
    fi

    if [ ! -f "AGENTS.md" ]; then
        return 1  # No conflict if file doesn't exist
    fi

    # Check if it contains Hera
    if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
        return 1  # No Hera content, no conflict
    fi

    # Check for agent marker comment
    local agent_marker="hera-installed-for: ${agent}"
    if grep -q "$agent_marker" "AGENTS.md" 2>/dev/null; then
        return 2  # Already installed for same agent
    fi

    # Check for different agent marker
    if grep -q "hera-installed-for:" "AGENTS.md" 2>/dev/null; then
        local existing_agent
        existing_agent=$(grep "hera-installed-for:" "AGENTS.md" | head -1 | sed 's/.*hera-installed-for: //' | sed 's/ .*//')
        echo "$existing_agent"
        return 3  # Conflict: different agent
    fi

    return 0  # Hera content exists but no marker (legacy)
}

# Add agent marker to AGENTS.md
add_agent_marker() {
    local agent="$1"
    local target="$2"
    local marker="<!-- hera-installed-for: ${agent} -->"

    # Add marker at the beginning (after frontmatter if present)
    if head -1 "$target" | grep -q "^---"; then
        # Find end of frontmatter
        local line_num=0
        local found_end=false
        while IFS= read -r line; do
            ((line_num++))
            if [ "$line_num" -gt 1 ] && [ "$line" = "---" ]; then
                found_end=true
                # Insert marker after frontmatter
                sed -i "${line_num}a\\${marker}" "$target"
                break
            fi
        done < "$target"
        if [ "$found_end" = false ]; then
            # No end of frontmatter found, prepend
            sed -i "1i\\${marker}" "$target"
        fi
    else
        # No frontmatter, prepend
        sed -i "1i\\${marker}" "$target"
    fi
}

# Install for specific agent
install_for_agent() {
    local agent="$1"
    local success=true

    case "$agent" in
        claude)
            print_info "Installing for Claude Code..."
            # Backup existing CLAUDE.md if it doesn't contain Hera
            if [ -f "CLAUDE.md" ]; then
                if grep -q "Hera" "CLAUDE.md" 2>/dev/null; then
                    print_warning "CLAUDE.md already contains Hera — skipping"
                    return 0
                fi
                cp "CLAUDE.md" "CLAUDE.md.hera-backup"
                print_info "Backed up existing CLAUDE.md → CLAUDE.md.hera-backup"
            fi
            download_file "CLAUDE.md" "CLAUDE.md" || success=false
            if [ "$success" = true ]; then
                print_success "Created CLAUDE.md"
            fi
            ;;
        hermes)
            print_info "Installing for Hermes Agent..."
            local target_dir="$HOME/.hermes/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to $target_dir/SKILL.md"
            fi
            ;;
        opencode)
            print_info "Installing for OpenCode..."
            check_agents_md_conflict "opencode"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for OpenCode — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "opencode")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with opencode version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md → AGENTS.md.hera-backup"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "opencode" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        codex)
            print_info "Installing for Codex..."
            check_agents_md_conflict "codex"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for Codex — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "codex")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with codex version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md → AGENTS.md.hera-backup"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "codex" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        aider)
            print_info "Installing for Aider..."
            check_agents_md_conflict "aider"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for Aider — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "aider")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with aider version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md → AGENTS.md.hera-backup"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "aider" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        cursor)
            print_info "Installing for Cursor..."
            mkdir -p ".cursor/rules"
            if [ -f ".cursor/rules/hera.mdc" ]; then
                if grep -q "Hera" ".cursor/rules/hera.mdc" 2>/dev/null; then
                    print_warning ".cursor/rules/hera.mdc already contains Hera — skipping"
                    return 0
                fi
                cp ".cursor/rules/hera.mdc" ".cursor/rules/hera.mdc.hera-backup"
                print_info "Backed up existing .cursor/rules/hera.mdc"
            fi
            download_file ".cursor/rules/hera.mdc" ".cursor/rules/hera.mdc" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to .cursor/rules/hera.mdc"
            fi
            ;;
        antigravity)
            print_info "Installing for Google Antigravity..."
            mkdir -p ".agents/rules" ".agents/workflows"
            download_file ".agents/rules/hera.md" ".agents/rules/hera.md" || success=false
            download_file ".agents/workflows/hera.md" ".agents/workflows/hera.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to .agents/"
            fi
            ;;
        pi)
            print_info "Installing for Pi coding agent..."
            local target_dir="$HOME/.pi/agent/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to $target_dir/SKILL.md"
            fi
            ;;
        gemini)
            print_info "Installing for Gemini CLI..."
            if [ -f "GEMINI.md" ]; then
                if grep -q "Hera" "GEMINI.md" 2>/dev/null; then
                    print_warning "GEMINI.md already contains Hera — skipping"
                    return 0
                fi
                cp "GEMINI.md" "GEMINI.md.hera-backup"
                print_info "Backed up existing GEMINI.md"
            fi
            download_file "AGENTS.md" "GEMINI.md" || success=false
            if [ "$success" = true ]; then
                print_success "Created GEMINI.md"
            fi
            ;;
        copilot)
            print_info "Installing for GitHub Copilot CLI..."
            local target_dir="$HOME/.copilot/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to $target_dir/SKILL.md"
            fi
            ;;
        kilo)
            print_info "Installing for Kilo Code..."
            mkdir -p ".kilo/skills/hera"
            download_file "SKILL.md" ".kilo/skills/hera/SKILL.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to .kilo/skills/hera/SKILL.md"
            fi
            ;;
        kiro)
            print_info "Installing for Kiro..."
            mkdir -p ".kiro/skills/hera"
            download_file "SKILL.md" ".kiro/skills/hera/SKILL.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to .kiro/skills/hera/SKILL.md"
            fi
            ;;
        devin)
            print_info "Installing for Devin CLI..."
            local target_dir="$HOME/.config/devin/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md" || success=false
            if [ "$success" = true ]; then
                print_success "Installed to $target_dir/SKILL.md"
            fi
            ;;
        codebuddy)
            print_info "Installing for CodeBuddy..."
            if [ -f "CODEBUDDY.md" ]; then
                if grep -q "Hera" "CODEBUDDY.md" 2>/dev/null; then
                    print_warning "CODEBUDDY.md already contains Hera — skipping"
                    return 0
                fi
                cp "CODEBUDDY.md" "CODEBUDDY.md.hera-backup"
                print_info "Backed up existing CODEBUDDY.md"
            fi
            download_file "AGENTS.md" "CODEBUDDY.md" || success=false
            if [ "$success" = true ]; then
                print_success "Created CODEBUDDY.md"
            fi
            ;;
        amp)
            print_info "Installing for Amp..."
            check_agents_md_conflict "amp"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for Amp — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "amp")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with amp version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "amp" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        trae)
            print_info "Installing for Trae..."
            check_agents_md_conflict "trae"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for Trae — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "trae")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with trae version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "trae" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        claw)
            print_info "Installing for OpenClaw..."
            check_agents_md_conflict "claw"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for OpenClaw — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "claw")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with claw version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "claw" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        droid)
            print_info "Installing for Factory Droid..."
            check_agents_md_conflict "droid"
            local conflict_result=$?
            if [ "$conflict_result" -eq 2 ]; then
                print_warning "AGENTS.md already contains Hera for Factory Droid — skipping"
                return 0
            elif [ "$conflict_result" -eq 3 ]; then
                local existing_agent
                existing_agent=$(check_agents_md_conflict "droid")
                print_warning "AGENTS.md was installed for ${existing_agent} — overwriting with droid version"
            fi
            if [ -f "AGENTS.md" ]; then
                if ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                    cp "AGENTS.md" "AGENTS.md.hera-backup"
                    print_info "Backed up existing AGENTS.md"
                fi
            fi
            download_file "AGENTS.md" "AGENTS.md" || success=false
            if [ "$success" = true ]; then
                add_agent_marker "droid" "AGENTS.md"
                print_success "Created AGENTS.md"
            fi
            ;;
        all)
            print_info "Installing for all agents..."
            local fail_count=0
            for a in claude hermes opencode codex cursor antigravity pi gemini copilot kilo kiro devin codebuddy aider amp trae claw droid; do
                install_for_agent "$a" 2>/dev/null || { print_warning "Skipped $a"; ((fail_count++)); }
            done
            if [ "$fail_count" -gt 0 ]; then
                print_warning "${fail_count} agents had failures"
            else
                print_success "Installed for all agents!"
            fi
            ;;
        *)
            print_error "Unknown agent: $agent"
            show_help
            exit 1
            ;;
    esac

    if [ "$success" = false ]; then
        return 1
    fi
}

# Uninstall Hera from a specific agent
uninstall_for_agent() {
    local agent="$1"
    local removed=0
    local restored=0
    local skipped=0

    print_info "Uninstalling from ${agent}..."

    case "$agent" in
        claude)
            if [ ! -f "CLAUDE.md" ]; then
                print_info "CLAUDE.md does not exist — skipping"
                ((skipped++))
            elif ! grep -q "Hera" "CLAUDE.md" 2>/dev/null; then
                print_warning "CLAUDE.md does not contain Hera — skipping"
                ((skipped++))
            elif [ -f "CLAUDE.md.hera-backup" ]; then
                cp "CLAUDE.md.hera-backup" "CLAUDE.md"
                rm -f "CLAUDE.md.hera-backup"
                print_success "Restored CLAUDE.md from backup"
                ((restored++))
            else
                rm -f "CLAUDE.md"
                print_success "Removed CLAUDE.md"
                ((removed++))
            fi
            ;;
        hermes)
            local target="$HOME/.hermes/skills/hera/SKILL.md"
            if [ ! -f "$target" ]; then
                print_info "$target does not exist — skipping"
                ((skipped++))
            else
                rm -f "$target"
                print_success "Removed $target"
                ((removed++))
            fi
            ;;
        cursor)
            local target=".cursor/rules/hera.mdc"
            if [ ! -f "$target" ]; then
                print_info "$target does not exist — skipping"
                ((skipped++))
            elif [ -f "${target}.hera-backup" ]; then
                cp "${target}.hera-backup" "$target"
                rm -f "${target}.hera-backup"
                print_success "Restored $target from backup"
                ((restored++))
            else
                rm -f "$target"
                print_success "Removed $target"
                ((removed++))
            fi
            ;;
        opencode|codex|aider|amp|trae|claw|droid)
            # AGENTS.md sharing agents
            if [ ! -f "AGENTS.md" ]; then
                print_info "AGENTS.md does not exist — skipping"
                ((skipped++))
            elif ! grep -q "Hera" "AGENTS.md" 2>/dev/null; then
                print_warning "AGENTS.md does not contain Hera — skipping"
                ((skipped++))
            elif [ -f "AGENTS.md.hera-backup" ]; then
                cp "AGENTS.md.hera-backup" "AGENTS.md"
                rm -f "AGENTS.md.hera-backup"
                print_success "Restored AGENTS.md from backup"
                ((restored++))
            else
                rm -f "AGENTS.md"
                print_success "Removed AGENTS.md"
                ((removed++))
            fi
            ;;
        gemini)
            if [ ! -f "GEMINI.md" ]; then
                print_info "GEMINI.md does not exist — skipping"
                ((skipped++))
            elif [ -f "GEMINI.md.hera-backup" ]; then
                cp "GEMINI.md.hera-backup" "GEMINI.md"
                rm -f "GEMINI.md.hera-backup"
                print_success "Restored GEMINI.md from backup"
                ((restored++))
            else
                rm -f "GEMINI.md"
                print_success "Removed GEMINI.md"
                ((removed++))
            fi
            ;;
        codebuddy)
            if [ ! -f "CODEBUDDY.md" ]; then
                print_info "CODEBUDDY.md does not exist — skipping"
                ((skipped++))
            elif [ -f "CODEBUDDY.md.hera-backup" ]; then
                cp "CODEBUDDY.md.hera-backup" "CODEBUDDY.md"
                rm -f "CODEBUDDY.md.hera-backup"
                print_success "Restored CODEBUDDY.md from backup"
                ((restored++))
            else
                rm -f "CODEBUDDY.md"
                print_success "Removed CODEBUDDY.md"
                ((removed++))
            fi
            ;;
        antigravity)
            rm -f ".agents/rules/hera.md" ".agents/workflows/hera.md"
            print_success "Removed .agents/rules/hera.md and .agents/workflows/hera.md"
            ((removed+=2))
            ;;
        kilo)
            rm -f ".kilo/skills/hera/SKILL.md"
            print_success "Removed .kilo/skills/hera/SKILL.md"
            ((removed++))
            ;;
        kiro)
            rm -f ".kiro/skills/hera/SKILL.md"
            print_success "Removed .kiro/skills/hera/SKILL.md"
            ((removed++))
            ;;
        pi)
            rm -f "$HOME/.pi/agent/skills/hera/SKILL.md"
            print_success "Removed ~/.pi/agent/skills/hera/SKILL.md"
            ((removed++))
            ;;
        copilot)
            rm -f "$HOME/.copilot/skills/hera/SKILL.md"
            print_success "Removed ~/.copilot/skills/hera/SKILL.md"
            ((removed++))
            ;;
        devin)
            rm -f "$HOME/.config/devin/skills/hera/SKILL.md"
            print_success "Removed ~/.config/devin/skills/hera/SKILL.md"
            ((removed++))
            ;;
        *)
            print_error "Unknown agent: $agent"
            show_help
            exit 1
            ;;
    esac

    print_info "${agent}: ${removed} removed, ${restored} restored, ${skipped} skipped"
}

show_help() {
    echo ""
    echo -e "${BOLD}Hera — AI Coding Agent Architecture Reference${NC}"
    echo ""
    echo "Usage:"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash                    # Auto-detect"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash -s -- claude        # Specific agent"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash -s -- all           # All agents"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash -s -- --yes         # CI/CD (no prompt)"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash -s -- uninstall claude  # Uninstall"
    echo ""
    echo "Or clone and run:"
    echo "  git clone ${REPO_URL} && cd hera"
    echo "  ./install.sh claude"
    echo "  ./install.sh uninstall claude"
    echo ""
    echo "Flags:"
    echo "  --yes, -y              Skip confirmation prompt (CI/CD friendly)"
    echo "  --version-tag <tag>    Install from specific git tag/branch (default: main)"
    echo ""
    echo "Commands:"
    echo "  install <agent>        Install for specific agent (default)"
    echo "  uninstall <agent>      Uninstall from specific agent"
    echo "  list                   List supported agents"
    echo ""
    echo "Supported agents:"
    echo "  claude        Claude Code          → CLAUDE.md"
    echo "  hermes        Hermes Agent         → ~/.hermes/skills/hera/SKILL.md"
    echo "  cursor        Cursor               → .cursor/rules/hera.mdc"
    echo "  opencode      OpenCode             → AGENTS.md"
    echo "  codex         Codex                → AGENTS.md"
    echo "  kilo          Kilo Code            → .kilo/skills/hera/SKILL.md"
    echo "  kiro          Kiro                 → .kiro/skills/hera/SKILL.md"
    echo "  aider         Aider                → AGENTS.md"
    echo "  gemini        Gemini CLI           → GEMINI.md"
    echo "  pi            Pi coding agent      → ~/.pi/agent/skills/hera/SKILL.md"
    echo "  copilot       GitHub Copilot CLI   → ~/.copilot/skills/hera/SKILL.md"
    echo "  devin         Devin CLI            → ~/.config/devin/skills/hera/SKILL.md"
    echo "  antigravity   Google Antigravity   → .agents/rules/ + .agents/workflows/"
    echo "  codebuddy     CodeBuddy            → CODEBUDDY.md"
    echo "  amp           Amp                  → AGENTS.md"
    echo "  trae          Trae                 → AGENTS.md"
    echo "  claw          OpenClaw             → AGENTS.md"
    echo "  droid         Factory Droid        → AGENTS.md"
    echo "  all           Install for all agents"
    echo ""
    echo "Detection:"
    echo "  Hera auto-detects your agent by checking for marker files and commands."
    echo "  If multiple agents are detected, you will be asked to choose."
    echo "  If no agent is detected, an interactive selection menu appears."
    echo ""
}

# Interactive mode — ask user which agent (all 18 agents listed)
interactive_mode() {
    echo ""
    echo -e "${CYAN}${BOLD}Which AI coding agent do you use?${NC}"
    echo ""
    echo "  1)  Claude Code          → CLAUDE.md"
    echo "  2)  Hermes Agent         → ~/.hermes/skills/hera/SKILL.md"
    echo "  3)  Cursor               → .cursor/rules/hera.mdc"
    echo "  4)  OpenCode             → AGENTS.md"
    echo "  5)  Codex                → AGENTS.md"
    echo "  6)  Kilo Code            → .kilo/skills/hera/SKILL.md"
    echo "  7)  Kiro                 → .kiro/skills/hera/SKILL.md"
    echo "  8)  Aider                → AGENTS.md"
    echo "  9)  Gemini CLI           → GEMINI.md"
    echo "  10) Pi coding agent      → ~/.pi/agent/skills/hera/SKILL.md"
    echo "  11) GitHub Copilot CLI   → ~/.copilot/skills/hera/SKILL.md"
    echo "  12) Devin CLI            → ~/.config/devin/skills/hera/SKILL.md"
    echo "  13) Google Antigravity   → .agents/rules/ + .agents/workflows/"
    echo "  14) CodeBuddy            → CODEBUDDY.md"
    echo "  15) Amp                  → AGENTS.md"
    echo "  16) Trae                 → AGENTS.md"
    echo "  17) OpenClaw             → AGENTS.md"
    echo "  18) Factory Droid        → AGENTS.md"
    echo "  19) All agents"
    echo ""
    read -p "Enter number (1-19): " choice

    case "$choice" in
        1)  install_for_agent "claude" ;;
        2)  install_for_agent "hermes" ;;
        3)  install_for_agent "cursor" ;;
        4)  install_for_agent "opencode" ;;
        5)  install_for_agent "codex" ;;
        6)  install_for_agent "kilo" ;;
        7)  install_for_agent "kiro" ;;
        8)  install_for_agent "aider" ;;
        9)  install_for_agent "gemini" ;;
        10) install_for_agent "pi" ;;
        11) install_for_agent "copilot" ;;
        12) install_for_agent "devin" ;;
        13) install_for_agent "antigravity" ;;
        14) install_for_agent "codebuddy" ;;
        15) install_for_agent "amp" ;;
        16) install_for_agent "trae" ;;
        17) install_for_agent "claw" ;;
        18) install_for_agent "droid" ;;
        19) install_for_agent "all" ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

# ============================================================================
# Main
# ============================================================================

# Parse arguments
AGENT_ARG=""
parse_args "$@"

print_banner

# Handle version tag
if [ "$VERSION_TAG" != "main" ]; then
    print_info "Using version tag: ${VERSION_TAG}"
fi

case "$COMMAND" in
    help)
        show_help
        exit 0
        ;;
    list)
        show_help
        ;;
    uninstall)
        if [ -z "$AGENT_ARG" ]; then
            print_error "Please specify an agent to uninstall."
            echo "Usage: ./install.sh uninstall <agent>"
            echo "Example: ./install.sh uninstall claude"
            exit 1
        fi
        uninstall_for_agent "$AGENT_ARG"
        echo ""
        print_success "Uninstall complete!"
        echo ""
        ;;
    install)
        # Check if agent is specified as argument
        if [ -n "$AGENT_ARG" ]; then
            case "$AGENT_ARG" in
                -h|--help)
                    show_help
                    exit 0
                    ;;
                list)
                    show_help
                    ;;
                *)
                    install_for_agent "$AGENT_ARG"
                    ;;
            esac
        else
            # Auto-detect with scoring
            IFS='|' read -ra detected_parts <<< "$(detect_agents)"
            detected_keys_str="${detected_parts[0]:-}"
            detected_names_str="${detected_parts[1]:-}"
            detected_scores_str="${detected_parts[2]:-}"

            # Convert to arrays
            IFS=' ' read -ra detected_keys <<< "$detected_keys_str"
            IFS=' ' read -ra detected_names <<< "$detected_names_str"
            IFS=' ' read -ra detected_scores <<< "$detected_scores_str"
            detected_count="${#detected_keys[@]}"

            if [ "$detected_count" -eq 0 ]; then
                # No agents detected — show interactive selection
                print_warning "Could not auto-detect your agent."
                if [ "$AUTO_YES" = true ]; then
                    print_error "No agent detected and --yes flag is set. Please specify an agent explicitly."
                    echo "Example: ./install.sh claude --yes"
                    exit 1
                fi
                interactive_mode
            elif [ "$detected_count" -eq 1 ]; then
                # Exactly one agent detected — ask for confirmation
                print_info "Detected: ${detected_names[0]} (score: ${detected_scores[0]})"
                if [ "$AUTO_YES" = true ]; then
                    install_for_agent "${detected_keys[0]}"
                else
                    read -p "Install for ${detected_names[0]}? (Y/n): " confirm
                    if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
                        interactive_mode
                    else
                        install_for_agent "${detected_keys[0]}"
                    fi
                fi
            else
                # Multiple agents detected — show them and ask user to choose
                print_warning "Multiple agents detected:"
                for i in "${!detected_keys[@]}"; do
                    echo "  ${BOLD}${detected_names[$i]}${NC} (score: ${detected_scores[$i]})"
                done
                echo ""

                if [ "$AUTO_YES" = true ]; then
                    # Auto-select highest-scored agent
                    print_info "Non-interactive mode: auto-selecting ${detected_names[0]} (highest score)"
                    install_for_agent "${detected_keys[0]}"
                else
                    interactive_mode
                fi
            fi
        fi
        ;;
esac

echo ""
print_success "Hera installed successfully!"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Read the architecture: cat SKILL.md"
echo "  2. Or visit: https://github.com/ahmdd4vd/hera"
echo ""
