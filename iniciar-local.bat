@echo off
title Oraculo Ciber-Filosofico - Servidor Local PWA
echo Iniciando servidor local en http://localhost:8080 ...
start http://localhost:8080
python -m http.server 8080
pause
