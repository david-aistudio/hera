#!/bin/bash
# Hera — AI Coding Agent Architecture Reference
# One-liner install: curl -sSL https://raw.githubusercontent.com/david-aistudio/hera/main/install.sh | bash

set -e

REPO_URL="https://github.com/david-aistudio/hera.git"
RAW_URL="https://raw.githubusercontent.com/david-aistudio/hera/main"
TEMP_DIR=$(mktemp -d)
# Clean up TEMP_DIR on exit (success or failure)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

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

# Auto-detect which agent the user is using
detect_agent() {
    local detected=""

    # Claude Code
    if [ -f "CLAUDE.md" ] || [ -d ".claude" ] || command -v claude &>/dev/null; then
        detected="claude"
    fi

    # Hermes Agent
    if [ -d "$HOME/.hermes" ] || [ -f "$HOME/.hermes/config.yaml" ]; then
        detected="${detected:-hermes}"
    fi

    # Cursor
    if [ -d ".cursor" ] || [ -f ".cursorrules" ]; then
        detected="${detected:-cursor}"
    fi

    # OpenCode
    if [ -f "opencode.json" ] || [ -d ".opencode" ]; then
        detected="${detected:-opencode}"
    fi

    # Kilo Code
    if [ -d ".kilo" ]; then
        detected="${detected:-kilo}"
    fi

    # Kiro
    if [ -d ".kiro" ]; then
        detected="${detected:-kiro}"
    fi

    # Aider
    if [ -f ".aider.conf.yml" ] || [ -f ".aider" ]; then
        detected="${detected:-aider}"
    fi

    # Gemini
    if [ -f "GEMINI.md" ] || [ -d ".gemini" ]; then
        detected="${detected:-gemini}"
    fi

    # Pi
    if [ -d "$HOME/.pi" ]; then
        detected="${detected:-pi}"
    fi

    echo "$detected"
}

# Download file from GitHub
download_file() {
    local file_path="$1"
    local target_path="$2"
    local tmp_file="${TEMP_DIR}/$(basename "$file_path")"
    # Use temp file so partial downloads don't leave a corrupt file in place
    if ! curl -fsSL "${RAW_URL}/${file_path}" -o "$tmp_file" 2>/dev/null; then
        print_error "Failed to download ${file_path}"
        return 1
    fi
    mv "$tmp_file" "$target_path"
}

# Install for specific agent
install_for_agent() {
    local agent="$1"

    case "$agent" in
        claude)
            print_info "Installing for Claude Code..."
            download_file "CLAUDE.md" "CLAUDE.md"
            print_success "Created CLAUDE.md"
            ;;
        hermes)
            print_info "Installing for Hermes Agent..."
            local target_dir="$HOME/.hermes/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md"
            print_success "Installed to $target_dir/SKILL.md"
            ;;
        opencode|codex|aider|claw|droid|trae|amp)
            print_info "Installing for $agent..."
            download_file "AGENTS.md" "AGENTS.md"
            print_success "Created AGENTS.md"
            ;;
        cursor)
            print_info "Installing for Cursor..."
            mkdir -p ".cursor/rules"
            download_file ".cursor/rules/hera.mdc" ".cursor/rules/hera.mdc"
            print_success "Installed to .cursor/rules/hera.mdc"
            ;;
        antigravity)
            print_info "Installing for Google Antigravity..."
            mkdir -p ".agents/rules" ".agents/workflows"
            download_file ".agents/rules/hera.md" ".agents/rules/hera.md"
            download_file ".agents/workflows/hera.md" ".agents/workflows/hera.md"
            print_success "Installed to .agents/"
            ;;
        pi)
            print_info "Installing for Pi coding agent..."
            local target_dir="$HOME/.pi/agent/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md"
            print_success "Installed to $target_dir/SKILL.md"
            ;;
        gemini)
            print_info "Installing for Gemini CLI..."
            download_file "AGENTS.md" "GEMINI.md"
            print_success "Created GEMINI.md"
            ;;
        copilot)
            print_info "Installing for GitHub Copilot CLI..."
            local target_dir="$HOME/.copilot/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md"
            print_success "Installed to $target_dir/SKILL.md"
            ;;
        kilo)
            print_info "Installing for Kilo Code..."
            mkdir -p ".kilo/skills/hera"
            download_file "SKILL.md" ".kilo/skills/hera/SKILL.md"
            print_success "Installed to .kilo/skills/hera/SKILL.md"
            ;;
        kiro)
            print_info "Installing for Kiro..."
            mkdir -p ".kiro/skills/hera"
            download_file "SKILL.md" ".kiro/skills/hera/SKILL.md"
            print_success "Installed to .kiro/skills/hera/SKILL.md"
            ;;
        devin)
            print_info "Installing for Devin CLI..."
            local target_dir="$HOME/.config/devin/skills/hera"
            mkdir -p "$target_dir"
            download_file "SKILL.md" "$target_dir/SKILL.md"
            print_success "Installed to $target_dir/SKILL.md"
            ;;
        codebuddy)
            print_info "Installing for CodeBuddy..."
            download_file "AGENTS.md" "CODEBUDDY.md"
            print_success "Created CODEBUDDY.md"
            ;;
        all)
            print_info "Installing for all agents..."
            for a in claude hermes opencode codex cursor antigravity pi gemini copilot kilo kiro devin codebuddy aider amp trae claw droid; do
                install_for_agent "$a" 2>/dev/null || print_warning "Skipped $a"
            done
            print_success "Installed for all agents!"
            ;;
        *)
            print_error "Unknown agent: $agent"
            show_help
            exit 1
            ;;
    esac
}

show_help() {
    echo ""
    echo "Usage:"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash                    # Auto-detect"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash -s -- claude        # Specific agent"
    echo "  curl -sSL ${RAW_URL}/install.sh | bash -s -- all           # All agents"
    echo ""
    echo "Or clone and run:"
    echo "  git clone ${REPO_URL} && cd hera"
    echo "  ./install.sh claude"
    echo ""
    echo "Supported agents:"
    echo "  claude      Claude Code"
    echo "  hermes      Hermes Agent"
    echo "  opencode    OpenCode"
    echo "  codex       Codex"
    echo "  cursor      Cursor"
    echo "  antigravity Google Antigravity"
    echo "  pi          Pi coding agent"
    echo "  gemini      Gemini CLI"
    echo "  aider       Aider"
    echo "  copilot     GitHub Copilot CLI"
    echo "  amp         Amp"
    echo "  kilo        Kilo Code"
    echo "  kiro        Kiro"
    echo "  devin       Devin CLI"
    echo "  trae        Trae"
    echo "  codebuddy   CodeBuddy"
    echo "  claw        OpenClaw"
    echo "  droid       Factory Droid"
    echo "  all         Install for all agents"
    echo ""
}

# Interactive mode — ask user which agent
interactive_mode() {
    echo ""
    echo -e "${CYAN}Which AI coding agent do you use?${NC}"
    echo ""
    echo "  1) Claude Code"
    echo "  2) Hermes Agent"
    echo "  3) Cursor"
    echo "  4) OpenCode"
    echo "  5) Kilo Code"
    echo "  6) Kiro"
    echo "  7) Aider"
    echo "  8) Gemini CLI"
    echo "  9) Pi coding agent"
    echo "  10) GitHub Copilot CLI"
    echo "  11) All agents"
    echo ""
    read -p "Enter number (1-11): " choice

    case "$choice" in
        1)  install_for_agent "claude" ;;
        2)  install_for_agent "hermes" ;;
        3)  install_for_agent "cursor" ;;
        4)  install_for_agent "opencode" ;;
        5)  install_for_agent "kilo" ;;
        6)  install_for_agent "kiro" ;;
        7)  install_for_agent "aider" ;;
        8)  install_for_agent "gemini" ;;
        9)  install_for_agent "pi" ;;
        10) install_for_agent "copilot" ;;
        11) install_for_agent "all" ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Main
print_banner

# Check if agent is specified as argument
if [ -n "${1:-}" ]; then
    case "$1" in
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            install_for_agent "$1"
            ;;
    esac
else
    # Auto-detect
    detected=$(detect_agent)

    if [ -n "$detected" ]; then
        print_info "Detected: $detected"
        read -p "Install for $detected? (Y/n): " confirm
        if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
            interactive_mode
        else
            install_for_agent "$detected"
        fi
    else
        print_warning "Could not auto-detect your agent."
        interactive_mode
    fi
fi

echo ""
print_success "Hera installed successfully!"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Read the architecture: cat SKILL.md"
echo "  2. Or visit: https://github.com/david-aistudio/hera"
echo ""
