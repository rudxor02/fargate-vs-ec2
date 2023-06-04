username="<put username>"
docker login
docker build -t almost:1gb - < Dockerfile
docker tag almost:1gb "${username}/almost:1gb"
docker push "${username}/almost:1gb"
