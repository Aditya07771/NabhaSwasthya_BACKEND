# Use official Node.js Alpine image for a smaller footprint
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies (use ci for reproducible builds if you have package-lock.json)
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on
EXPOSE 5000

# Command to run your app
CMD ["node", "src/server.js"]