std - script -q -c "ping -c 1 google.com"
stdbuf -oL lsd -l
socat - EXEC:"ping -c 1 google.com"
