// The chained-push read of the outbound check, plugins/rules/scripts/chain.mjs: whether a git push follows, in one command, a git
// call that makes a commit. The hook's own denial is tested in outbound.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chained, pushed } from '../../plugins/rules/scripts/chain.mjs';

test('R405: a push is chained where it runs after a call that makes a commit, as the shell reads the command', () => {
  // Each case is a command, whether PowerShell reads it, and whether the push is chained.
  const cases = [
    ['git commit -m x && git push', false, true],
    ['git push && git commit -m x', false, false],
    ['git commit -m "then git push"', false, false],
    ['git stash push && git commit -m x; git stash push', false, false],
    ['git -C "$(pwd)" commit -m x && git -C $(pwd) push', false, true],
    ['"/usr/bin/git" commit -m x && git push', false, true],
    ['bash <<EOF\ngit commit -m x\ngit push\nEOF', false, true],
    ['cat <<EOF\ngit commit -m x\ngit push\nEOF', false, false],
    ['git commit -m x 2>&1 && git push 2>&1 | tail -3', false, true],
    ['git commit -m "it\'s done && git push', false, true],
    ['git commit -m x && echo "$(git push)"', false, true],
    ['git commit -m "see $(git log -1 --format=%s) and git push"', false, false],
    ['git commit -m x; git -c alias.p=push p', false, false],
    ['git merge --abort; git push', false, false],
    ['git revert HEAD && git push -u origin HEAD', false, true],
    ['git commit -m x; if ($?) { git push }', true, true],
    ['& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x; git push', true, true],
    ['git commit -m "say `"git push`" later"', true, false],
    ['powershell -Command "git commit -m x; git push"', true, true],
    ['Write-Output "git commit -m x; git push"', true, false],
    ['$o=git commit -m x; git push', true, true],
    ['$o =git commit -m x; git push', true, true],
    ['git commit -m x; if ($?) {git push}', true, true],
    ['git commit -m x; if ($?) {git push --dry-run}', true, false],
    ['o=git commit -m x; git push', false, false],
    ['(( n << 2 ))\ngit commit -m x\ngit push', false, true],
    ['echo $[1<<2]\ngit commit -m x\ngit push', false, true],
    ['echo $((1<<2)); git commit -m x; git push', false, true],
    ['git pull --ff-only -q && git push', false, false],
    ['git pull --ff-only origin pull/123/head && git push', false, true],
    ['git pull --ff-only --rebase && git push', false, true],
    ['cat <<EOF\n$(git commit -m x)\nEOF\ngit push', false, true],
    ['cat <<EOF\n`git commit -m x`\nEOF\ngit push', false, true],
    ['cat <<EOF\n\\$(git commit -m x)\nEOF\ngit push', false, false],
    ['cat <<\'EOF\'\n$(git commit -m x)\nEOF\ngit push', false, false],
    ['cat <<"EOF"\n$(git commit -m x)\nEOF\ngit push', false, false],
    ['cat <<\\EOF\n$(git commit -m x)\nEOF\ngit push', false, false],
    ['$m = @"\n$(git commit -m x)\n"@; git push', true, true],
    ['$m = @\'\n$(git commit -m x)\n\'@; git push', true, false],
    ['(( n << 1 ))\ngit commit -m "fix -h flag"\ngit push', false, true],
    ['p() ( git push ); git commit -m x; p', false, true],
    ['push.it() { git push; }; git commit -m x; push.it', false, true],
    ['$p = { git push }; git commit -m x; & $p', true, true],
    ['filter p { git push }; git commit -m x; p', true, true],
    ["trap 'git push' EXIT; git commit -m x", false, true],
    ['git push; git commit -m x', false, false],
    ['git push; git commit -m x', true, false],
    ["git commit -m \u201cdon't\u201d; git push; Write-Host \u201cit's done\u201d", true, true],
    ["git commit -m x; if ($?) {# it's fine\ngit push # it's\n}", true, true],
    ["git commit -m x <# it's #>; git push <# it's #>", true, true],
    ['git commit -m x; echo ${env:X}; git push', true, true],
    ['(( n << 1 ))\ngit -C "my dir" commit -m x\ngit push', false, true],
    ['[string]$o=git commit -m x; git push', true, true],
    ['$o ??=git commit -m x; git push', true, true],
    ["out=\"$(git commit -m 'wip (part 1' 2>&1)\"; git push", false, true],
    ["out=\"$(echo ')'; git commit -m x)\"; git push", false, true],
    ['cat <<EOF | bash\ngit commit -m x\ngit push\nEOF', false, true],
    ["echo 'git commit -m x; git push' | sh", false, true],
    ["'git commit -m x; git push' | iex", true, true],
    ["echo 'git commit -m x; git push' | cat", false, false],
    ["echo 'git commit -m x; git push' || sh", false, false],
    ['git commit -F - <<< "$msg"\ngit push --dry-run', false, false],
    ['git commit -F - <<< "$msg"\ngit push', false, true],
    ['git push && git commit --allow-empty -m "start rework of parse()"', false, false],
    ["bash -c 'p() { git push; }; git commit -m x; p'", false, true],
    ["git commit -m $'Fix\\n\\nIt\\'s done'; git push origin main # it's", false, true],
    ["bash -c $'git commit -m x\\ngit push'", false, true],
    ["git commit -m $'it\\'s'; git push --dry-run", false, false],
    ["printf 'git commit -m x\\ngit push\\n' | sh", false, true],
    ["bash -c 'git commit -m x\\ngit push'", false, true],
    ["bash -c 'git -C C:\\new commit -m x && git push'", false, true],
    ["bash -c 'git -C C:\\repo commit -m x && git push'", false, true],
    // A text a shell is given through an expansion, or in parentheses, is read by the command's words alone.
    ["eval \"$(echo 'git commit -m x; git push')\"", false, true],
    ["bash -c \"$(cat <<'EOF'\ngit commit -m x\ngit push\nEOF\n)\"", false, true],
    ["x='git commit -m x; git push'; eval \"$x\"", false, true],
    ["eval `echo 'git commit -m x; git push'`", false, true],
    ["$SHELL -c 'git commit -m x; git push'", false, true],
    ["bash<<<'git commit -m x; git push'", false, true],
    ["ksh -c 'git commit -m x; git push'", false, true],
    ["source <(echo 'git commit -m x; git push')", false, true],
    [". <(echo 'git commit -m x; git push')", false, true],
    ["$c = 'git commit -m x; git push'; iex $c", true, true],
    ["Invoke-Expression ('git commit -m x; ' + 'git push')", true, true],
    ["& ([scriptblock]::Create('git commit -m x; git push'))", true, true],
    ['bash -c "cd $dir && git pull --ff-only && git push"', false, true],
    ['bash -lc "git pull --ff-only && git push"', false, false],
    ['pwsh -Command "git commit -m x; git push --dry-run"', true, false],
    ["bash -c 'git commit -m x'; git log --grep push", false, false],
    ['git add . && git commit -m "$m" && git log --grep push', false, false],
    ["x=$(echo 'git push'); git commit -m x; echo \"$x\"", false, false],
    // A word that holds a $ may be git, a brace ends a PowerShell word, and a text reaches a shell through a longer pipe.
    ["GIT='git -C repo'; $GIT add -A && $GIT commit -m x && $GIT push", false, true],
    ['git commit -m x && "$(which git)" push', false, true],
    ['git commit -m x && "${GIT:-git}" push', false, true],
    ['$git = "git"; & $git commit -m x; & $git push', true, true],
    ['try{git commit -m x; git push}catch{}', true, true],
    ['git commit -m x; 1..2 | ForEach-Object{git push}', true, true],
    ['gh pr create --title "$t" --body "$b" && git push', false, false],
    ['cd "$dir" && git commit -m "$m" && git log --grep push', false, false],
    ["echo 'git commit -m x; git push' | tee run.log | sh", false, true],
    ["echo 'git commit -m x; git push' | tee run.log | cat", false, false],
    // A text a shell is handed runs where the shell stands, so the order of the words does not count there.
    ["p='git push'; git commit -m x; eval \"$p\"", false, true],
    // A << inside (( )) or $[ ] shifts a number, so a later line equal to its operand ends no here-document.
    ['(( n << 1 ))\ngit commit -m x\n1\ngit push', false, true],
    ['echo $[1<<2]\ngit commit -m x\n2\ngit push', false, true],
    ['(( n << 1 ))\ngit commit -m x\ngit push --dry-run', false, false],
    ['cat << E\ngit commit -m "fix -h flag"\ngit push', false, true],
    ['cat << E\ngit commit -m "x"\ngit push --dry-run', false, true],
    // A redirect after a pull that only fast-forwards names nothing.
    ['git pull --ff-only 2>&1 && git push', false, false],
    ['git pull --ff-only > /dev/null && git push 2>&1', false, false],
    ['git pull --ff-only origin 2>&1 && git push', false, true],
    // The parentheses in a here-document's body close no substitution, so a message with one unpaired is read as a message.
    ["git commit -m \"$(cat <<'EOF'\nfix: x\n\n1) git push now reads\nEOF\n)\"", false, false],
    ["git commit -m \"$(cat <<'EOF'\n1) x\nEOF\n)\" && git push", false, true],
    ['git commit -m "$(cat <<EOF\n:) see $(git log -1 --format=%s) and git push\nEOF\n)"', false, false],
    // In a PowerShell text in double quotes a backtick and n is a line break.
    ['"git commit -m x`ngit push" | iex', true, true],
    ['git commit -m "a`nb"; git push --dry-run', true, false],
    // A parenthesis in a quoted string or a comment pairs with none, so a substitution ends where the shell ends it.
    ['git add -A && echo "Branch: $(git branch --show-current | tr "(" "-")" && git commit -m "Step 2) done" && git push', false, true],
    ['git commit -m x # it\'s (\necho "$(git push --dry-run)"', false, false],
    ["git commit -m $'it\\'s (' && echo \"$(git push --dry-run)\"", false, false],
    ["$m = @'\nit's (\n'@; git commit -m $m; echo \"$(git push --dry-run)\"", true, false],
    ["git commit -m x <# it's ( #>; echo \"$(git push --dry-run)\"", true, false],
    // A dry run is -n alone or among push's own one-letter flags; any other word that holds an n sends the push.
    ['git commit -m x && git push -onotify origin main', false, true],
    ['git commit -m x; Start-Process git -ArgumentList push -Wait -NoNewWindow', true, true],
    ['git commit -m x && git push -fn origin main', false, false],
    // A PowerShell block ends no command, so a push in a later block of the same statement follows the commit.
    ['try { git add -A; git commit -m x } finally { git push }', true, true],
    ['if ($a) { git commit -m x } else { git push }', true, true],
    ['echo Next: git commit -m x then git push', false, false],
    ['echo Next: git commit -m x then git push', true, false],
    // The words-alone read leaves out a commit's own message, where the message holds no expansion.
    ['source "$VENV/bin/activate" && git commit -m "Retry push on timeout"', false, false],
    ['git commit -m "Fix push retry" && bash ./scripts/test.sh "$1"', false, false],
    ['git commit -m "$m push" && bash ./scripts/test.sh "$1"', false, true],
    // A definition counts where a command starts, and name() is none through the PowerShell tool.
    ['git push; git checkout main; git pull; [IO.Path]::GetTempPath()', true, false],
    ['git push && git checkout main && git pull && echo trap set', false, false],
    ['if true; then p() { git push; }; fi; git commit -m x; p', false, true],
    // A command that names a shell joins its words, so a commit's message there is read as the command it runs.
    ['eval git commit -m "x; git push" "$y"', false, true],
    ['pwsh -Command git commit -m "x; git push" $y', true, true],
    // A definition counts after a keyword, `builtin` or `command` with or without a space before it, and after no other word.
    ["if true;then trap 'git push' EXIT;fi; git commit -m x", false, true],
    ["builtin trap 'git push' EXIT; git commit -m x", false, true],
    ["command trap 'git push' EXIT; git commit -m x", false, true],
    ['for i in 1;do p() { git push; };done; git commit -m x; p', false, true],
    ["echo then trap 'git push' EXIT; git commit -m x", false, false],
    ["eval trap 'git push' EXIT; git commit -m x", false, true],
    ["time trap 'git push' EXIT; git commit -m x", false, true],
    ["2>/dev/null trap 'git push' EXIT; git commit -m x", false, true],
    ["X=1 trap 'git push' EXIT; git commit -m x", false, true],
    // A # starts a comment at the start of a word: not right after the ) of a $( ), but right after a } in PowerShell.
    ['git commit -m x; echo $(date)#tag "$(git push --dry-run)"', false, false],
    ['git commit -m x; if ($?) {echo hi}# it\'s (\necho "$(git push --dry-run)"', true, false],
    // A shell that runs what a substitution prints may run a commit's message read back, so the message is read as words.
    ['git add -A && git commit -qm "git push -q"; eval "$(git log -1 --format=%s)"', false, true],
    ['git add -A && git commit -qm "git push -q"; bash -c \'eval "$(git log -1 --format=%s)"\'', false, true],
    ['git commit -qm "git push -q"; echo "$(eval "$(git log -1 --format=%s)")"', false, true],
    // A message can only be read back by a shell that runs after the commit.
    ['eval "$(ssh-agent -s)" && git commit -m "Fix push retry"', false, false],
    ['source "$(poetry env info --path)/bin/activate" && git commit -m "Fix push retry"', false, false],
    // A quoted value that holds the subcommand with more words, as -ArgumentList takes, names the call.
    ["git commit -m x; Start-Process git -ArgumentList 'push','-q' -Wait -NoNewWindow", true, true],
    ["git commit -m x; Start-Process git -ArgumentList 'push -q' -Wait -NoNewWindow", true, true],
    ['git commit -m x; Start-Process git -ArgumentList "push -q" -Wait -NoNewWindow', true, true],
    ["Start-Process git -ArgumentList 'commit','-m','x' -Wait; git push", true, true],
    // A dry-run flag in the value that names the subcommand sends nothing.
    ["git commit -m x; Start-Process git -ArgumentList 'push','--dry-run' -Wait", true, false],
    ["git commit -m x; Start-Process git -ArgumentList 'push --dry-run' -Wait", true, false],
  ];
  for (const [command, ps, want] of cases) assert.equal(chained(command, ps), want, command);
});

test('R405: a word that is all quoted keeps its place where a definition is looked for', () => {
  // Each case is a command, whether PowerShell reads it, and whether the push is chained.
  const cases = [
    ['>>"o.txt" trap "git push -q" EXIT; git commit -qm x', false, true],
    [">>'o.txt' trap \"git push -q\" EXIT; git commit -qm x", false, true],
    ['2>>"e.txt" trap "git push -q" EXIT; git commit -qm x', false, true],
    ['>"o.txt" trap "git push -q" EXIT; git commit -qm x', false, true],
    ['<<<"x" trap "git push -q" EXIT; git commit -qm x', false, true],
    ['>>"o.txt" trap { git push -q }; git commit -qm x', true, true],
    ['function "deploy" { git push -q }; git commit -qm x; deploy', true, true],
    // A quoted text of letters alone, the empty one too, leaves the word whole, as the shell joins it.
    ["tr''ap \"git push -q\" EXIT; git commit -qm x", false, true],
    ['"trap" "git push -q" EXIT; git commit -qm x', false, true],
    ["tr'a'p \"git push -q\" EXIT; git commit -qm x", false, true],
    // A quoted word after a program's name is an argument, and the word after it defines nothing.
    ['cat <<<"x" trap "git push -q" EXIT; git commit -qm x', false, false],
    ['echo "set" trap; git push -q; git commit -qm x', false, false],
    ['git push -q; echo "a" "b" (); git commit -qm x', false, false],
  ];
  for (const [command, ps, want] of cases) assert.equal(chained(command, ps), want, command);
});

test('R405: a push is found among the calls of a command, with the words it is given', () => {
  // Each case is a command, whether PowerShell reads it, and the words of its pushes, null where it holds no push.
  const cases = [
    ['git push', false, ''],
    ['git -c user.name="A&B" push -q origin main', false, '-q origin main'],
    ["git -c credential.helper='!f() { :; }; f' push origin HEAD:topic", false, 'origin HEAD:topic'],
    ['g=git; $g push -u origin HEAD', false, '-u origin HEAD'],
    ['g=git; $g push origin main', false, 'origin main'],
    ['X=1 $g push origin main', false, 'origin main'],
    ['$DOCKER push image:tag', false, 'image:tag'],
    ['make -C $DIR push', false, null],
    ['cp "$f" push', false, null],
    ['echo $USER "push the button"', false, null],
    ['git push origin main; git push origin v1', false, 'origin main\norigin v1'],
    ['git push origin --delete v1 && git push origin v1', false, 'origin --delete v1\norigin v1'],
    // A redirect and the file it names stay on the machine.
    ['git push origin main 2>/tmp/zq/push.log', false, 'origin main'],
    ['git push origin main > out.log 2>&1', false, 'origin main'],
    ["Start-Process git -ArgumentList 'push','origin','topic' -Wait", true, 'origin topic -Wait'],
    ['git stash push -m wip', false, null],
    ['git status; echo push', false, null],
    ['docker push image:tag', false, null],
    ['git commit -m "git push origin topic"', false, null],
  ];
  for (const [command, ps, want] of cases) assert.equal(pushed(command, ps), want, command);
});

test('R405: a definition is found after a redirect whose sign ends in | and after an empty quoted word', () => {
  // Each case is a command, whether PowerShell reads it, and whether the push is chained.
  const cases = [
    ['>| "o" trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['2>| "o" trap "git push -q" EXIT; git commit -qm x; true', false, true],
    [">| 'o x' trap \"git push -q\" EXIT; git commit -qm x; true", false, true],
    ['>| o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['>|"o" trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['<<<"" trap "git push -q" EXIT; git commit -qm x', false, true],
    ['<<< "" trap "git push -q" EXIT; git commit -qm x', false, true],
    ["<<< $'' trap \"git push -q\" EXIT; git commit -qm x", false, true],
    ["<<<'' trap \"git push -q\" EXIT; git commit -qm x", false, true],
    ['>"" trap "git push -q" EXIT; git commit -qm x', false, true],
    // An empty quoted text joined to letters still leaves the word whole.
    ["tr''ap \"git push -q\" EXIT; git commit -qm x", false, true],
    ["''trap \"git push -q\" EXIT; git commit -qm x", false, true],
    ["trap'' \"git push -q\" EXIT; git commit -qm x", false, true],
    // An empty quoted text after eval is no redirect target.
    ['eval "" trap \'git push -q\' EXIT; git commit -qam x', false, true],
    // With no definition after it, neither form chains a push that comes first.
    ['echo a >| "o"; git push -q; git commit -qm x', false, false],
    ['git push -q >| o | cat; git commit -qm x', false, false],
    ['echo "" trap; git push -q; git commit -qm x', false, false],
  ];
  for (const [command, ps, want] of cases) assert.equal(chained(command, ps), want, command);
  // The | of >| ends no command, so the words after the file are still the push's.
  assert.equal(pushed('git push -q >| out.log origin v1', false), '-q origin v1');
  // A > escaped or closing a PowerShell comment is no redirect sign, so the | after it ends the command.
  assert.equal(pushed('echo \\>|git push origin main:side', false), 'origin main:side');
  assert.equal(pushed('echo a <# c #>|git push -q', true), '-q');
});

test('R405: a definition is found after an option of command or time, an assignment with += or to an element, an escaped space and in $"..."', () => {
  // Each case is a command, whether PowerShell reads it, and whether the push is chained.
  const cases = [
    ['time -p trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['command -p trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['command -- trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['builtin -- trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x+=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x[0]=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=1 y+=2 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['time -p command -p x+=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    // An escaped space stays in the target of a redirect and in the value of an assignment.
    ['>o\\ x trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['>|o\\ x trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['<<<x\\ y trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['<<<\\  trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['A=a\\ b trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['$"trap" "git push -q" EXIT; git commit -qm x; true', false, true],
    // An escaped character and a brace inside a value or an index end neither.
    ['x=a\\;b trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=a{b trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=${HOME}/a trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x[a\\;]=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    // Between words PowerShell reads an escaped space as a space.
    ['` trap { git push -q }; git commit -m x', true, true],
    // command -v and -V only name the word, and a value ends where its command does, so the trap after it is an argument.
    ['command -v trap; git push -q; git commit -qm x', false, false],
    ['command -pv trap x; git push -q; git commit -qm x', false, false],
    ['x=a;b trap y; git push -q; git commit -qm x', false, false],
    ['echo a\\ trap; git push -q; git commit -qm x', false, false],
    ['echo x >o\\ x; git push -q; git commit -qm x', false, false],
    // An escaped ; and a brace inside a word start no command.
    ['echo \\; trap x; git push -q; git commit -qm x', false, false],
    ['x\\=1 trap x; git push -q; git commit -qm x', false, false],
    ['echo a.{js,ts} trap x; git push -q; git commit -qm x', false, false],
    ['git push && git pull && rsync -a --exclude={node_modules,.git} . /backup', false, false],
  ];
  for (const [command, ps, want] of cases) assert.equal(chained(command, ps), want, command);
  // The $ of $"..." is no character of the word, and an escaped space puts no redirect target among the words of a push.
  assert.equal(pushed('git push -q origin $"main"', false), '-q origin main');
  assert.equal(pushed('git push origin $$"x"', false), 'origin $$x');
  assert.equal(pushed('git push >log\\ file origin main', false), 'origin main');
});

test('R405: a definition is found after a brace joined to a redirect, in words a shell runs with escaped characters, after a quoted option, an index with a blank and a ${...} that holds a ;', () => {
  // Each case is a command, whether PowerShell reads it, and whether the push is chained.
  const cases = [
    // A { before a redirect or a continued line is a word by itself, and {name} before one is part of its sign.
    ['{>o trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['{</dev/null trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['{>>o trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['{<<<x trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['{>&2 trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['true; {>o trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['if :; then {>o trap "git push -q" EXIT; }; fi; git commit -qm x; true', false, true],
    ['{\\\n trap "git push -q" EXIT; git commit -qm x; }', false, true],
    ['{fd}>o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['{fd}\\\n>o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    // After a word that names a shell an escaped character is the character, and a word that holds one is a text the shell may run.
    ['eval f\\(\\) \\{ git push -q\\; \\}; git commit -qm x; f', false, true],
    ['eval true\\; trap \\" git push -q \\" EXIT; git commit -qm x; true', false, true],
    ['eval \\{ trap \\" git push -q \\" EXIT\\; \\}; git commit -qm x; true', false, true],
    ['pwsh -NoProfile -c 1\\; function f \\{ git push -q \\}\\; git commit -qm x\\; f', false, true],
    ['pwsh -NoProfile -c 1`; function f `{ git push -q `}`; git commit -qm x`; f', true, true],
    ['trap git\\ push\\ -q EXIT; git commit -qm x; true', false, true],
    ['eval trap\\ \\"git\\ push\\ -q\\"\\ EXIT; git commit -qm x; true', false, true],
    ['bash -c trap\\ \\"git\\ push\\ -q\\"\\ EXIT\\;git\\ commit\\ -qm\\ x', false, true],
    ['eval echo \\; trap x; git push -q; git commit -qm x', false, true],
    ['git commit -qm x; bash <<<git\\ push\\ -q', false, true],
    ['git commit -qm x; eval git\\ push\\ -q>/dev/null', false, true],
    ['git commit -qm x; bash <<< git\\ push\\ -q', false, true],
    ['git commit -qm x; eval echo hi >git\\ push', false, false],
    ['git commit -qm x; eval echo hi > git\\ push', false, false],
    ['git commit -qm x; bash<<<git\\ push\\ -q', false, true],
    // The target of a redirect is the outer shell's, so an escaped character in it stays one character.
    ['eval >o\\ x trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['eval >a\\;b trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['eval > a\\;b trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['eval 2>|a\\;b trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['eval {> o\\ x trap \\" git push -q \\" EXIT\\; \\}; git commit -qm x; true', false, true],
    ['eval >"o>" true\\; trap \\" git push -q \\" EXIT; git commit -qm x; true', false, true],
    // A dash stays a dash where it is quoted or escaped.
    ['command $"-p" trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['command "-p" trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['command \'-p\' trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['command $\'-p\' trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['command \\-p trap "git push -q" EXIT; git commit -qm x; true', false, true],
    // After an = PowerShell reads an escaped space or tab as a space.
    ['$s =` { git push -q }; git commit -qm x; & $s', true, true],
    ['$s=` { git push -q }; git commit -qm x; & $s', true, true],
    ['$s =`\t{ git push -q }; git commit -qm x; & $s', true, true],
    // A ${...} is part of its word up to its closing brace, the substitutions in it are still run, and one left open is read by its words alone.
    ['x=${y:-a;b} trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=${y:-a|b} trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=${y:-a&b} trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=${y:-${z:-a;b}} trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x=${y:-${ :; } a;b} trap "git push -q" EXIT; git commit -qm x', false, true],
    ['x=${y:-$(git commit -qm x)}; git push -q', false, true],
    ['echo ${y:-a; git commit -qm x; git push -q', false, true],
    // Before a blank or a | the brace opens commands the shell runs in place.
    ['git commit -qm x; echo ${ git push -q; }', false, true],
    ['git commit -qm x; echo ${|git push -q;}', false, true],
    ['git commit -qm x; echo ${y:-${ git push -q; }}', false, true],
    ['git commit -qm x; echo ${\\\n git push -q; }', false, true],
    ['echo ${ trap "git push -q" EXIT; }; git commit -qm x; true', false, true],
    ['bash -c \'trap "git push -q" EXIT; git commit -qm x\'; echo ${a:-${ b; }}', false, true],
    // The second $ of $$ opens none.
    ['echo $${a; trap "git push -q" EXIT; git commit -qm x; echo }', false, true],
    ['echo $$${a;b} function f; git push -q; git commit -qm x', false, false],
    // An index may hold a blank or a bracket.
    ['x[1 + 1]=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['x[ 0 ]=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['a=(0); x[a[0]]=1 trap "git push -q" EXIT; git commit -qm x; true', false, true],
    // With no shell named, no command start and no option, the same characters define nothing.
    ['x{ trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['echo a.{js,ts} trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['echo \\; trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['\\{ trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['echo x{>o trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['git push -q; git commit -qm x; function` f', true, false],
    ['command "-v" trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['command \\-v trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['command "my-prog" trap "git push -q" EXIT; git commit -qm x; true', false, false],
    ['echo git\\ commit\\ -m\\ x\\;git\\ push', false, false],
    ['echo ${y:-a;b} function f; git push -q; git commit -qm x', false, false],
    ['echo x[ 0 ]=1 trap x; git push -q; git commit -qm x', false, false],
    ['\\{fd}>o trap x; git push -q; git commit -qm x', false, false],
    ['\'{fd\'}>o trap x; git push -q; git commit -qm x', false, false],
    // The redirect {name[index]}>file, the running shell named by $BASH or $0, and a ${ cmd; } inside a double-quoted text, which the text after a <<< does not run.
    ['{a[0]}>o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['{a[0]}>>o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['\\{a[0]}>o trap x; git push -q; git commit -qm x', false, false],
    ['$BASH -c "git commit -qm x; git push -q"', false, true],
    ['${BASH} -c "git commit -qm x; git push -q"', false, true],
    [`"$BASH" -c "trap 'git push -q' EXIT; git commit -qm x"`, false, true],
    ['"$0" -c "git commit -qm x; git push -q"', false, true],
    ['$BASH -c git\\ commit\\ -qm\\ x\\;\\ git\\ push\\ -q', false, true],
    ['git commit -qm "usage: $0 push"', false, false],
    ['echo "${ trap \'git push -q\' EXIT; }"; git commit -qm x; true', false, true],
    ['x="${| trap \'git push -q\' EXIT; }"; git commit -qm x; true', false, true],
    ['echo "${x:-${ trap \'git push -q\' EXIT; }}"; git commit -qm x; true', false, true],
    ['echo $"a ${ f() { git push -q; }; }"; git commit -qm x; f', false, true],
    ['echo "$${ trap \'git push -q\' EXIT; }"; git commit -qm x; true', false, false],
    ['echo "\\${ trap \'git push -q\' EXIT; }"; git commit -qm x; true', false, false],
    ['cat <<<"${ trap \'git push -q\' EXIT; }"; git commit -qm x; true', false, false],
    ['echo "${x} git push"; git commit -qm x; true', false, false],
    // The walk does not tell an argument from the word that starts a command, so a { or {name} joined to a redirect after echo, and a script block after an escaped space in an argument that ends in =, read as a definition, and a shell named by an argument reads an escaped ; after it as the end of a command.
    ['echo {>o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['echo {fd}>o trap "git push -q" EXIT; git commit -qm x; true', false, true],
    ['git push -q; git commit -qm x; Write-Output a=` { b }', true, true],
    ['echo eval x\\; trap y EXIT; git push -q; git commit -qm x', false, true],
  ];
  for (const [command, ps, want] of cases) assert.equal(chained(command, ps), want, command);
});

test('R405: a run of assignments or of options is read in linear time', () => {
  const started = Date.now();
  for (const [piece, count] of [[';a=1', 128000], [';command -x -x', 16000], [';x[', 64000], ['{a=', 64000], ['x[0]=1 ', 16000], ['x[ ', 64000], ['$' + '{a;', 64000], ['{\\\n', 64000], ['$a ', 64000], ['$$"a" ', 64000]]) assert.equal(chained(piece.repeat(count) + '; git push -q; git commit -qm x', false), false, piece);
  assert.ok(Date.now() - started < 5000);
});

test('R405: a long run of substitutions is read in linear time', () => {
  const started = Date.now();
  assert.equal(chained('echo ' + '$('.repeat(20000) + ' && git commit -m x && git push', false), true);
  assert.equal(chained('echo ' + '"$(echo '.repeat(2000) + 'x' + ')"'.repeat(2000) + ' && git push', false), false);
  assert.ok(Date.now() - started < 5000);
});

test('R405: a run of words made of redirect brackets is read in linear time', () => {
  const started = Date.now();
  assert.equal(pushed('git commit -qm note; ' + '>>>>>>>> '.repeat(10) + ':', false), null);
  assert.equal(chained('git commit -qm note; ' + '2>>&1 '.repeat(10) + ': && git push', false), true);
  assert.ok(Date.now() - started < 5000);
});
