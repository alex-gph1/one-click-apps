npm update -g pnpm
pnpm i
pnpm run validate
pnpm run format:write
read -p "Press key to continue.. " -n1 -s
pnpm run build
git commit -a