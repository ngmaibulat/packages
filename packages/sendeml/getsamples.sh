wget http://untroubled.org/spam/2023-02.7z

7zz x 2023-02.7z

rm -fr ./queue/2023
rm -fr ./queue/spam

mv 2023 ./queue
mv spam ./queue

rm -f 2023-02.7z*

