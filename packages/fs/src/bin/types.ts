export type HelpChmodOptions = {
    format?: 'cli' | 'html' | 'markdown';
};

export type LsOptions = {
    dir?: string;
};

export type HashResults = {
    filename: string;
    filetype: string;
    md5: string;
    sha256: string;
};
