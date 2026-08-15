#!/usr/bin/env -S node --no-warnings

// The published bin runs under plain node, so zx's globals ($, chalk, echo,
// os, ...) have to be imported rather than supplied by the interpreter.
import "zx/globals";

// zx 8 defaults $.verbose to false. This script exists to show the output of
// the commands it drives, which is what zx 7 did by default.
$.verbose = true;

const msg = `
The script will configure vim.

Make sure to have vim installed.

For learning vim, take a look at following resources:
https://devhints.io/vim
https://vimsheet.com/
https://quickref.me/vim
https://vim.rtorr.com/
https://www.freecodecamp.org/news/vim-isnt-that-scary-here-are-5-free-resources-you-can-use-to-learn-it-ab78f5726f8d/
https://github.com/iggredible/Learn-Vim
https://danielmiessler.com/study/vim/
http://www.vimgenius.com/lessons/vim-intro/levels/level-1
https://github.com/amix/vimrc
`;

console.log("");
console.log(chalk.yellowBright(msg));
console.log(chalk.yellowBright(`Platform: ${os.platform}`));
console.log("");

await $`rm -rf ~/.vim_runtime`;
echo(``);

await $`git clone --depth=1 https://github.com/amix/vimrc.git ~/.vim_runtime`;
echo(``);

await $`sh ~/.vim_runtime/install_awesome_vimrc.sh`;
echo(``);

await $`echo "set nu" >> ~/.vim_runtime/my_configs.vim`;
echo(``);
