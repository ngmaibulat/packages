# @aibulat/auth

Manage a `users` table of bcrypt-hashed credentials from the command line, and
hash or verify a password on its own. Three bins: `auth`, `bcrypt` and
`bcrypt-compare`.

The database is reached through [knex](https://knexjs.org/), so the driver is
whatever `AUTH_DB_DRIVER` names; `mysql2` ships as a dependency.

## Install

```bash
npm install -g @aibulat/auth
```

## Hashing on its own

Neither of these touches the database:

```bash
bcrypt 'P@ssw0rd'
# $2a$10$07okrFScBYiAXXpaMLyq/uvExcWXOw4B.rxaY0MtOWl6Rtl1IPsbW

bcrypt-compare 'P@ssw0rd' '$2a$10$07okrFScBYiAXXpaMLyq/uvExcWXOw4B.rxaY0MtOWl6Rtl1IPsbW'
# Hash match!
```

## Configuration

`auth` reads a `.env` from the working directory:

```bash
AUTH_DB_DRIVER = "mysql2"
AUTH_DB_HOST = "127.0.0.1"
AUTH_DB_PORT = "3306"
AUTH_DB_USER = "admin"
AUTH_DB_PASS = "P@ssw0rd"
AUTH_DB_NAME = "userdb"
```

Every variable is required; `auth` prints an example and exits if any is missing.

## Commands

```bash
auth help                     # show available commands
auth info                     # show database connection details
auth ping                     # check the db connection
auth init                     # create the users table
auth list                     # list users
auth add <email> <password>   # create a user
auth del <email>              # delete a user
auth chpass <email> <pass>    # change a password
auth check <email> <pass>     # verify a user/password pair
```

`auth init` refuses if the `users` table already exists.
