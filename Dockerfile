FROM --platform=linux/amd64 nginx:latest

RUN ["dd", "if=/dev/urandom", "of=random_data", "bs=1G", "count=1"]
CMD ["nginx", "-g", "daemon off;"]