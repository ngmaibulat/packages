# @aibulat/installer

Server-provisioning scripts for Ubuntu, packaged as commands. Each one automates
a setup that is otherwise a sequence of `apt` invocations and config edits.

Written with [zx](https://github.com/google/zx) — but the published bins run
under plain `node` and import `zx/globals` themselves, so `zx` does not have to
be installed separately.

## Install

```bash
npm install -g @aibulat/installer
```

## Commands

| Command          | What it does                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `i-ubuntu-mysql` | install MySQL Server and set a random root password               |
| `i-ubuntu-vim`   | install vim                                                       |
| `c-vim`          | write a vim configuration, and print learning resources           |
| `gen-pw`         | print a random password                                           |

## Use

```bash
gen-pw                 # no privileges needed
sudo i-ubuntu-mysql    # must run as root
sudo i-ubuntu-vim
c-vim
```

The three provisioning commands check `getuid()` and refuse with
`This program must be run as root!` when they are not privileged. `gen-pw` is
the exception — it is pure computation and prints a 12-character password.

`i-ubuntu-mysql` writes the credentials it generates into a `.env` and a knex
config so the freshly installed server is usable straight away.
