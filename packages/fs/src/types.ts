import { Stats } from 'node:fs';
import posix from 'posix';

export type UserData = {
    username: string;
    password: string;
    userIdentifier: number;
    groupIdentifier: number;
    fullName: string;
    homeDirectory: string;
    shell: string;
};

export type FileStat = {
    filename: string;
    stat: Stats;
    filetype?: string;
    userinfo?: UserData;
    groupinfo?: posix.Group;
};

export type DirContents = {
    dirs: FileStat[];
    files: FileStat[];
};
