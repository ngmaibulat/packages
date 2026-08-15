import fs from 'node:fs/promises'
import type { PathLike } from 'node:fs'

export async function moveFile(src: PathLike, dst: PathLike): Promise<boolean> {
    try {
        await fs.rename(src, dst)
        return true
    } catch (err: any) {
        return false
    }
}
