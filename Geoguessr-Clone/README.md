# Geoguessr-Clone-Project

## Link to the project

https://haydenkolb.github.io/Geoguessr-Clone-Project/dist/index.html

## Project Structure

### dist Folder
The dist folder contains the index.css, the index.html, and the main.js. This folder contains our scource code for css, and html, but not js.
You can change the code on the html and css files but not the js file. And you can open up the live server by using the index.html that is in this folder.  

### src folder
The src folder contains the project's JS scource code. This folder will be where we write our JS.
The JS files in this folder along with its dependencies (the imports we use) will be what is 'bundled' by Webpack 
into the main.js file in the dist folder. 

### Files in root
The .gitignore file simply tells git to ignore certain files and folders (the main.js file and node_modules folder). 
The package-lock.json and package.json files tell NPM what dependencies this project has as well as meta data of the project.
The webpack.config.js is just a file used to configure webpack. No need to touch any of these files. 

### node_modules folder
This folder will contain the project dependencies (Wepback & Firebase code/modules/libraries).
The node_modules folder does not show up on Github because it is on the git ignore list. However, you will see it in your local repository when you install
all the project dependencies (NPM will create it for you). You should not touch it. 


## Terminal Commands
Before running any of the following commands make sure your current working directory is the root of this project (geoguessr-clone-project).
You also need to have NPM installed to be able to run the commands.

If you haven't installed the project dependencies (Webpack, Firebase, Eslint, Airbnb) then use this command to install them.  
> `npm install`

To build the main.js file run this command. You should run this command everytime after you change the JS in the src folder.  
> `npm run build`

To use eslint (will fix errors and show errors it can't fix) on a JS file run this command. You should only use it on JS files you write (so only the files in the src folder).
> `npx eslint --fix <path to JS file here>`
