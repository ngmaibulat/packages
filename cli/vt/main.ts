import * as mod from "jsr:@sigma/pty-ffi";

const pty = new mod.Pty({
  cmd: "lsd",
  args: ["-la"],
  env: [],
});

// // executs ls -la repedetly and shows output
// while (true) {
//   await pty.write("ls -la\n");
//   const { data, done } = await pty.read();
//   if (done) break;
//   console.log(data);
//   await new Promise((r) => setTimeout(r, 100));
// }

let done = false;

while (!done) {
  await new Promise((r) => setTimeout(r, 100));
  const res = await pty.read();
  console.log(res.data);
  done = res.done;
}
