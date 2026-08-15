export function formatDate(d: Date) {
    const year = d.getFullYear();
    const month = d.getMonth().toString().padStart(2, '0');
    const day = d.getDay().toString().padStart(2, '0');
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const sec = d.getSeconds().toString().padStart(2, '0');
    const msec = d.getMilliseconds().toString().padStart(3, '0');

    return `${year}-${month}-${day} ${hour}:${min}`;
}
