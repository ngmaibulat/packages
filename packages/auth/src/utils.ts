const msg = `
help: show available commands
info: show database connection details
ping: check db connection
init: create schema
list: list users
add: create user
delete: delete user
chpass: change password for user
check: check user/pass combination
`;

export function help() {
    console.log(msg);
}
