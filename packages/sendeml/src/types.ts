export type smtpAuth = {
    user: string;
    pass: string;
};

export type smtpOptions = {
    host: string;
    port: number;
    secure: boolean;
    connectionTimeout: number;
    auth?: smtpAuth;
};

export type pingOptions = {
    sender: string;
    rcpt: string;
    subject?: string;
    text?: string;
};

export type sendOptions = {
    sender: string;
    rcpt: string;
    file: string;
};

export type sendDirOptions = {
    sender: string;
    rcpt: string;
    dir: string;
    max?: number;
    moveDest: string;
};

export type lsOptions = {
    dir: string;
};

export type viewOptions = {
    file: string;
};
