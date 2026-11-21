@echo off
rem The three-stage command in the installed app: runs resources\studio\bin\three-stage.mjs with THREE Stage.exe as Node.
rem Installed in <install dir>\resources\bin. Keep it ASCII only: cmd.exe does not read UTF-8 batch files reliably.
setlocal
set "THREE_STAGE_APP=%~dp0..\..\THREE Stage.exe"
set ELECTRON_RUN_AS_NODE=1
"%THREE_STAGE_APP%" "%~dp0..\studio\bin\three-stage.mjs" %*
