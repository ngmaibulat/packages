### Overview

Package to perform various installation automations.
Created by using:

- typescript
- google zx

### Install

- Create a stub npm project
- Install the tool there
- Use via `npx`. Or via `sudo npx`
- Also make sure to have zx

```bash
sudo npm i -g zx

mkdir tools
cd tools
npm init -y

npm i @aibulat/installer
```

### Uninstall

```bash
# just remove the folder where you have run npm init previosly
# for example:
rm -rf tools
```

### Update

```bash
cd tools # navigate to folder you have created
npm outdated
npm info    @aibulat/installer
npm install @aibulat/installer@latest
cat package-lock.json
```

### Use

- navigate to the folder with npm project, you have created
- run commands via `npx` or `sudo npx`

```bash
npx c-vim     # configure vim, make it nicer
npx gen-pw    # generate random password
```

On `Ubuntu Linux`, you can use mysql installer:

```bash
# install mysql, set random root password
# create database appdb
# create users: appro, apprw
# with read-only and read-write access to database
# create 3 .env files with db access params:
# root.env, appro.env, apprw.env

sudo npx i-ubuntu-mysql appdb
```
