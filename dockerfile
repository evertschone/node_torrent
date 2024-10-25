# Use the official Node.js image as a parent image
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json) files
COPY package*.json ./

# Install dependencies including ts-node
RUN npm install
RUN npm install -g ts-node

# Copy the rest of your application code
COPY . .

# Generate Prisma client
# RUN npx prisma generate

# Your app binds to port 3000 so you'll use the EXPOSE instruction to have it mapped by the docker daemon
EXPOSE 3000

# Define the command to run your app using ts-node
CMD ["ts-node", "src/server.ts"]