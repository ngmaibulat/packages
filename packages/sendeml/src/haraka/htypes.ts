export type QueueElement = {
    dtArrival: Date;
    dtNextAttempt: Date;
    attempts: number;
    pid: number;
    uniq: string;
    counter: number;
    host: string;
    ageSeconds: number;
    ageHours: number;
};

export type HarakaMailAddr = {
    original: string;
    original_host: string;
    host: string;
    user: string;
};

export type HQueueFile = {
    queue_time: number;
    dtQueue: Date;
    domain: string;
    rcpt_to: HarakaMailAddr[];
    mail_from: HarakaMailAddr;
    notes: any;
    uuid: string;
    filename: string;
    fileinfo: QueueElement;
    sender: string;
    recipients: string[];
    eml: string;
};

export type Filter = {
    src: string;
    dst: string;
    domain: string;
    minage: number;
    maxage: number;
    minattempts: number;
    datefrom: Date | false;
    dateto: Date | false;
};

export type ArgsSendMail = {
    file: string;
    list: string;
    host: string;
    port: number;
    user?: string;
    pass?: string;
    env: boolean;
    debug: boolean;
};
