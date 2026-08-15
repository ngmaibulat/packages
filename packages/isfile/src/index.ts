import fs from 'node:fs'

export default function isFile(path: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err, stat) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    resolve(false)
                } else {
                    reject(err)
                }
            } else {
                resolve(stat.isFile())
            }
        })
    })
}
