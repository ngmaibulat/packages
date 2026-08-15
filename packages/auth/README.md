### Auth tool

CLI tool: check username password via sql database table

### Install

```bash
sudo npm install -g @aibulat/auth
```

### Usage

```bash
bcrypt P@ssw0rd
bcrypt-compare 'P@ssw0rd' '$2a$10$aGlpNrWF1XjTjH/d7HsPQ.XFqqeMW.A6yiqQyVf3hCYeDJeO.9Zye'
```

### Auth tool:

Create .env file with DB access details. See example:

```bash
AUTH_DB_DRIVER = "mysql2"
AUTH_DB_HOST = "127.0.0.1"
AUTH_DB_PORT = "3306"
AUTH_DB_USER = "admin"
AUTH_DB_PASS = "P@ssw0rd"
AUTH_DB_NAME = "userdb"
```

Use commands:

```bash
# show available commands
auth help

# show database connection details
auth info

# check db connection
auth ping

# create schema
auth init

# list users
auth list

# create user
auth add:

# delete user
auth delete

# change password for user
auth chpass

# check user/pass combination
auth check:
```
