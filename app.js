const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const db = null;
const initializeDbAndServer = async()=>{
    try{
        db = await open({
            filename:dbPath,
            driver:sqlite3.Database,

        });
        app.listen(3000,()=>{
            console.log("Server Running at http://localhost:3000");

        });

        
    }catch(e){
      console.log(`DB Error:${e.message}`);
        
    }
}
initializeDbAndServer();

const authenticateToken = (request,response,next)=>{
    const {tweet} = request.body;
    const{tweetId} = request.params;
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if(authHeader!==undefined){
        jwtToken = authHeader.split(" ")[1];
    }
    if(jwtToken===undefined){
        response.status(401);
        response.send("Invalid JWT Token");

    }else{
        jwt.verify(jwtToken,"my-secret-token",async(error,payload)=>{
            if(error){
              response.status(401);
              response.send("Invalid JWT Token");
            }else{
              request.payload = payload;
              request.tweetId = tweetId;
              request.tweet = tweet;
              next();
            }
        })
    }
};
app.post("/register",async(request,response)=>{
    const{username,password,name,gender} = request.body;
    const selectUserQuery=`
    SELECT
      *
    FROM
      user
    WHERE
      username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if(dbUser===undefined){
        if(password.length<6){
          response.status(401);
          response.send("Password is too short");
        }else{
          const hashedPassword = await bcrypt.hash(password,10);
          const createUserQuery = `
            INSERT INTO
              user(name,username,password,gender)
            VALUES
                (
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
                         
            ) ;`;
        await db.run(createUserQuery);
        response.send("User Created Successfully");  
        
      }
  }else{
    response.status(400);
    response.send("User Already Exists");
  }
});
app.post("/login", async(request,response)=>{
    const(username,password) = request.body;
    const selectUserQuery=`
    SELECT
      *
    FROM
      user
    WHERE
      username='${username}';`;
  const dbUser = await db.run(selectUserQuery);
  if(dbUser===undefined){
    response.status(400);
    response.send("Invalid User");
  }else{
    const isPasswordValid=await bcrypt.compare(password,dbUser.password);
    if(isPasswordValid===true){
        const jwtToken=jwt.sign(dbUser,"my-secret-token");
        response.send({jwtToken});
    }else{
        response.status(400);
        response.send("Invalid Password");
      }
  }    

});

app.get("/user/tweets/feed",authenticateToken,async(request,response)=>{
    const {payload} =request;
    const { user_id, name,username,gender } = payload;
    const getTweetsFeedQuery=`
    SELECT
      username,
      tweet,
      date_time AS dateTime
    FROM
      follower INNER JOIN tweet on tweet.user_id = follower.following_user_id INNER JOIN user on user.user_id= follower.following_user_id
    WHERE
      follower.follower_user_id = ${user_id}
    ORDER BY
      dateTime DESC
    LIMIT  4 
    ;`;
    const tweetsFeedArray = await db.all(getTweetsFeedQuery);
    response.send(tweetsFeedArray);
});
app.get("/user/following", authenticateToken,async(request,response)=>{
    const {payload} = request;
    const {user_id,name,username,gender} = payload;
    const userFollowsQuery=`
    SELECT
      name
    FROM
      user INNER JOIN follower on user.user_id=follower.following_user_id
    WHERE
      follower.follower_user_id = ${user_id};`;
  const userFollowsArray = await db.all(userFollowsQuery);
  response.send(userFollowsArray);
});

app.get("/user/follower",authenticateToken,async(request,response)=>{
    const {payload} = request;
    const {user_id,name,username,gender} = payload;
    const userFollowersQuery=`
    SELECT 
      name
    FROM
      user INNER JOIN follower on user.user_id=follower.following_user_id
    WHERE
      follower.following_user_id = ${user_id};`;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);    
});

app.get("/tweets/:tweetId", authenticateToken,async(request,response)=>{
    const {tweetId} = request;
    const {payload} = request;
    const{user_id, name,username,gender} = payload;
    const tweetsQuery=`
    SELECT
      *
    FROM
      tweet
    WHERE
      tweet_id = ${tweetId};`;
  const tweetResult = await db.get(tweetsQuery);
  const userFollowersQuery=`
    SELECT
      *
    FROM
      follower INNER JOIN user on user.user_id =  follower.following_user_id
    WHERE
      follower.follower_user_id = ${user_id};`;
  const userFollowers = await db.all(userFollowersQuery);
  if(userFollowers.some((item)=>item.following_user_id===tweetResult)){
      const tweetDetailsQuery=`
    SELECT
      tweet,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
    FROM 
      tweet INNER JOIN like on tweet.tweet_id = like.tweet_id INNER JOIN reply on reply.tweet_id = tweet.tweet_id
    WHERE
      tweet.tweet_id = ${tweetId} AND tweet.user_id = ${user_id};`;
 const tweetDetails = await db.get(tweetDetailsQuery);
 response.send(tweetDetails);
  }else{
      response.status(401);
      response.send("Invalid Request");
  }        
});

app.get("/tweets/:tweetId/likes",authenticateToken,async(request,response)=>{
    const {tweetId} = request;
    const {payload} = request;
    const { user_id, name, username,gender} = payload;
    const getLikerUsersQuery=`
    SELECT
      *
    FROM
      follower INNER JOIN tweet on tweet.user_id = follower.following_user_id INNER JOIN like on like.tweet_id = tweet.tweet_id inner join user on
      user.user_id = like.user_id
    WHERE
      tweet.tweet_id = ${tweetId} and follower.follower_user_id= ${user_id};`;
  const likedUsers = await db.all(getLikerUsersQuery);
  if(likedUsers.length!==0){
      let likes=[];
      const getNamesArray = (likedUsers)=>{
      for(let item of likedUsers){
          likes.push(item.username);
      }
    };
    getNamesArray(likedUsers);
    response.send({likes});

  } else{
      response.status(401);
      response.send("Invalid Request");
  }   
})

app.get("/tweets/:tweetId/replies",authenticateToken,async(request,response)=>{
    const {tweetId} =request;
    const {payload} = request;
    const{user_id,name,username,gender} = payload;
    const getRepliedUserQuery=`
    SELECT
      *
    FROM
      follower INNER JOIN tweet on tweet.user_id = follower.following_user_id INNER JOIN reply on reply.tweet_id = tweet.tweet_id
      INNER JOIN user on user.user_id = reply.user_id
    WHERE
      tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${user_id};`;
  const repliedUsers=await db.all(getRepliedUserQuery);
  if(repliedUsers.length!==0){
      let replies=[];
      for(let item of repliedUsers){
          let objects={name:item.name,reply:item.reply,};
          replies.push(object);

      }
  } ;
  getNamesArray(repliedUsers);
  response.send({replies});   
}else{
    response.status(401);
    response.send("Invalid Request");
}
});

app.get("/user/tweets",authenticateToken,async(request,response)=>{
    const {payload} = request;
    const {user_id,name,username,gender} = payload;
    const getTweetsDetailsQuery=`
    SELECT
      tweet,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
    FROM
      user INNER JOIN tweet on user.user_id = tweet.user_id INNER JOIN like on like.tweet_id=tweet.tweet_id
    WHERE
      user.user_id = ${user_id}
    GROUP BY
      tweet.tweet_id

    ;`;
  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);  
});

app.post("/user/tweets",authenticateToken,async(request,response)=>{
    const {tweet} =request;
    const {tweetId} = request;
    const {payload} = request;
    const{user_id, name,username,gender} = payload;
    const postTweetQuery=`
    INSERT INTO
      tweet(tweet,user_id)
    VALUES
      ('${tweet}',${user_id});`;
 await db.run(postTweetQuery);
 response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId",authenticateToken,async(request,response)=>{
    const {tweetId} = request;
    const {payload} = request;
    const{user_id,name,username,gender} = payload;
    const selectUserQuery = `
    SELECT
      *
    FROM
      tweet
    WHERE
      tweet.user_id = ${user_id} and tweet.tweet_id = ${tweetId};`;
  const tweetUser = await db.all(selectUserQuery);
  if(tweetUser.length!==0){
      const deleteTweetQuery=`
    DELETE FROM
      tweet
    WHERE
      tweet.tweet_id = ${tweetId} and tweet.user_id = ${user_id};`;
  await ab.run(deleteTweetQuery);
  response.send("Tweet Removed");

  } else{
      response.status(401);
      response.send("Invalid Request");
  } 
});
export default app;