@echo off
chcp 65001 >nul
echo ============================================
echo   STUDIO 作品集 — 一键部署到 GitHub Pages
echo ============================================
echo.
echo 这个脚本会帮你：
echo   1. 在 GitHub 上创建一个公开仓库
echo   2. 把作品集文件推送上去
echo   3. 开启 GitHub Pages（免费永久托管）
echo.
echo 部署完成后你会得到一个类似这样的干净链接：
echo   https://你的GitHub用户名.github.io/portfolio
echo.
echo 前置条件：
echo   - 需要一个 GitHub 账号（没有的话先去 github.com 注册，免费的）
echo   - 需要安装了 Git（Windows 10/11 通常自带）
echo.
pause

:: 检查 git
where git >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Git。请先安装 Git：https://git-scm.com/downloads
    pause
    exit /b 1
)

:: 检查 gh CLI
where gh >nul 2>&1
if errorlevel 1 (
    echo.
    echo [提示] 未检测到 GitHub CLI (gh)
    echo 正在尝试用 git 方式部署...
    echo.
    echo 请按以下步骤操作（约 2 分钟）：
    echo.
    echo   步骤 1：打开 https://github.com/new
    echo   步骤 2：仓库名填   portfolio   （或随便你喜欢的名字）
    echo   步骤 3：选择 Public（公开）
    echo   步骤 4：不要勾选 "Add a README file"
    echo   步骤 5：点 Create repository
    echo.
    echo   创建完成后，把仓库页面显示的命令告诉我，
    echo   我来帮你完成剩余步骤。
    echo.
    pause
    exit /b 0
)

:: 用 gh CLI 自动化
echo 正在检查 GitHub 登录状态...
gh auth status >nul 2>&1
if errorlevel 1 (
    echo.
    echo 需要先登录 GitHub。即将弹出浏览器...
    gh auth login --web
    if errorlevel 1 (
        echo [错误] 登录失败。
        pause
        exit /b 1
    )
)

echo.
set /p REPO_NAME="请输入仓库名称（默认 portfolio）："
if "%REPO_NAME%"=="" set REPO_NAME=portfolio

echo.
echo 正在创建仓库 %REPO_NAME% ...
gh repo create %REPO_NAME% --public --confirm 2>nul
if errorlevel 1 (
    echo 仓库可能已存在，继续推送...
)

echo 正在初始化并推送文件...
cd /d "%~dp0"

:: 初始化 git（如果还没初始化）
if not exist .git (
    git init
    git add index.html styles.css app.js README.md
    git commit -m "Initial commit: STUDIO portfolio"
)

:: 设置远程仓库并推送
git remote remove origin 2>nul
gh repo set-origin $(gh repo view %REPO_NAME% --json url -q ".url")
git push -u origin main 2>nul || git push -u origin master

echo.
echo 正在启用 GitHub Pages...
gh api repos/{owner}/{repo}/pages -X POST -f build_branch=main -f source="{\"branch\":\"main\",\"path\":\"/\"}" 2>nul || ^
gh api repos/{owner}/{repo}/pages -X POST -f build_branch=master -f source="{\"branch\":\"master\",\"path\":\"/\"}"

echo.
echo ============================================
echo   部署完成！
echo ============================================
echo.
for /f %%i in ('gh repo view %REPO_NAME% --json url -q ".url"') do set REPO_URL=%%i
set PAGES_URL=https://%GH_USER%.github.io/%REPO_NAME%
echo 你的作品集地址：
echo   %PAGES_URL%
echo.
echo 仓库地址：
echo   %REPO_URL%
echo.
echo 注意：GitHub Pages 首次生效需要 1-2 分钟。
echo 如果打不开请稍等片刻再试。
echo.
pause
