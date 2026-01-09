# Git Workflow Guide

> **Complete guide** to using Git effectively in this project

---

## 📋 Table of Contents

1. [Basic Concepts](#-basic-concepts)
2. [Daily Workflow](#-daily-workflow)
3. [Branching Strategy](#-branching-strategy)
4. [Common Commands](#-common-commands)
5. [Solving Problems](#-solving-problems)
6. [Best Practices](#-best-practices)

---

## 🎯 Basic Concepts

### What is Git?

Git tracks changes to your code over time. Think of it like "save points" in a video game - you can always go back.

### Key Terms

| Term | What It Means |
|------|---------------|
| **Repository (repo)** | Your project folder tracked by Git |
| **Commit** | A snapshot of your code at a point in time |
| **Branch** | A separate line of development |
| **Merge** | Combining changes from one branch into another |
| **Push** | Upload your commits to GitHub |
| **Pull** | Download latest changes from GitHub |
| **Staging** | Selecting which changes to include in a commit |

---

## 🏃 Daily Workflow

### Starting Your Day

```bash
# 1. Make sure you're on the right branch
git checkout develop

# 2. Get latest changes from team
git pull origin develop
```

### Making Changes

```bash
# 1. Create a feature branch for your work
git checkout -b feature/add-new-report

# 2. Make your code changes...

# 3. See what you changed
git status

# 4. Stage your changes
git add .                    # Add all files
# OR
git add src/components/Report.tsx   # Add specific file

# 5. Commit with a message
git commit -m "Add new sales report component"

# 6. Push to GitHub
git push origin feature/add-new-report
```

### Finishing Your Feature

```bash
# 1. Switch to develop
git checkout develop

# 2. Get latest changes
git pull origin develop

# 3. Merge your feature
git merge feature/add-new-report

# 4. Push the merged develop
git push origin develop

# 5. Delete your feature branch (optional)
git branch -d feature/add-new-report
```

---

## 🌳 Branching Strategy

### Our Branches

```
main (production)
  │
  └── develop (integration)
        │
        ├── feature/invoice-redesign
        ├── feature/new-reports
        └── feature/fix-search
```

### Branch Types

| Branch | Purpose | Created From | Merges Into |
|--------|---------|--------------|-------------|
| `main` | Production code | — | — |
| `develop` | Integration branch | `main` | `main` |
| `feature/*` | New features | `develop` | `develop` |
| `hotfix/*` | Emergency fixes | `main` | `main` & `develop` |

### When to Use Each

| Situation | Branch |
|-----------|--------|
| Adding a new feature | `feature/feature-name` |
| Fixing a bug in development | `feature/fix-bug-name` |
| Emergency production fix | `hotfix/fix-name` |
| Regular development | `develop` |

---

## 💻 Common Commands

### Checking Status

```bash
# See what files changed
git status

# See detailed changes
git diff

# See commit history
git log --oneline -10

# See which branch you're on
git branch
```

### Working with Branches

```bash
# List all branches
git branch -a

# Create new branch
git checkout -b feature/my-feature

# Switch to existing branch
git checkout develop

# Delete local branch
git branch -d feature/my-feature

# Delete remote branch
git push origin --delete feature/my-feature
```

### Staging & Committing

```bash
# Stage all changes
git add .

# Stage specific file
git add src/App.tsx

# Stage part of a file (interactive)
git add -p

# Commit with message
git commit -m "Add new feature"

# Commit with longer message
git commit -m "Add new feature

- Added component X
- Updated styles
- Fixed bug Y"
```

### Syncing with GitHub

```bash
# Download latest changes
git pull origin develop

# Upload your changes
git push origin feature/my-feature

# First push of a new branch
git push -u origin feature/my-feature
```

---

## 🔧 Solving Problems

### Undo Last Commit (Keep Changes)

```bash
git reset --soft HEAD~1
```

### Undo Last Commit (Discard Changes)

```bash
git reset --hard HEAD~1
```

### Discard All Local Changes

```bash
git checkout .
```

### I Committed to Wrong Branch

```bash
# 1. Save your commit
git log --oneline -1   # Note the commit hash

# 2. Undo the commit (keep changes)
git reset --soft HEAD~1

# 3. Stash the changes
git stash

# 4. Switch to correct branch
git checkout correct-branch

# 5. Apply the changes
git stash pop

# 6. Commit again
git commit -m "Your message"
```

### Merge Conflicts

When Git can't automatically merge:

```bash
# 1. Git will tell you which files have conflicts
git status

# 2. Open the file - you'll see:
<<<<<<< HEAD
Your changes
=======
Their changes
>>>>>>> feature-branch

# 3. Edit the file to keep what you want

# 4. Stage the resolved file
git add filename.tsx

# 5. Complete the merge
git commit -m "Resolve merge conflict"
```

### I Need to Update My Branch with Latest Develop

```bash
git checkout feature/my-feature
git merge develop
```

### I Want to Start Fresh

```bash
# Get latest from remote, discard local changes
git fetch origin
git reset --hard origin/develop
```

---

## ✅ Best Practices

### Commit Messages

```bash
# Good ✅
git commit -m "Add customer search filter"
git commit -m "Fix invoice total calculation"
git commit -m "Update API endpoint for products"

# Bad ❌
git commit -m "fix"
git commit -m "update"
git commit -m "changes"
```

### Commit Message Format

```
<type>: <short description>

<optional longer description>
```

| Type | When to Use |
|------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `style:` | Formatting, no code change |
| `refactor:` | Code restructuring |
| `test:` | Adding tests |
| `chore:` | Maintenance tasks |

**Examples:**
```bash
git commit -m "feat: Add customer export to PDF"
git commit -m "fix: Correct GST calculation for returns"
git commit -m "docs: Update API documentation"
```

### Golden Rules

1. **Pull before you push** - Always get latest changes first
2. **Commit often** - Small commits are easier to understand
3. **Write clear messages** - Future you will thank you
4. **Never commit to main directly** - Always use branches
5. **Test before committing** - Make sure your code works

---

## 🎓 Quick Reference Card

### Most Used Commands

| Command | What It Does |
|---------|--------------|
| `git status` | See what changed |
| `git add .` | Stage all changes |
| `git commit -m "msg"` | Save a snapshot |
| `git push` | Upload to GitHub |
| `git pull` | Download from GitHub |
| `git checkout branch` | Switch branches |
| `git checkout -b name` | Create new branch |
| `git merge branch` | Merge branch into current |

### The Daily Flow

```bash
git checkout develop        # Start from develop
git pull                    # Get latest
git checkout -b feature/x   # Create feature branch
# ... make changes ...
git add .                   # Stage
git commit -m "message"     # Commit
git push origin feature/x   # Push
# ... create Pull Request on GitHub ...
```

---

## 📚 More Resources

- [Git Cheat Sheet (PDF)](https://education.github.com/git-cheat-sheet-education.pdf)
- [Interactive Git Tutorial](https://learngitbranching.js.org/)
- [GitHub Docs](https://docs.github.com/)

---

**Remember**: Git is a skill that improves with practice. Don't be afraid to experiment - you can almost always undo mistakes!
