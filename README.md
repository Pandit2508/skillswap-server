SkillSwap Backend
This is the backend server for SkillSwap, a platform where users can connect with each other to exchange skills. Users can create profiles, set their availability, send match requests, and schedule meetings when both users have overlapping time slots.
The backend is built using Node.js, Express, and PostgreSQL, and it manages authentication, profile data, match requests, and video meeting scheduling.
________________________________________
What this backend does
•	Handles user authentication using JWT and secure cookies
•	Allows users to create and update their profiles
•	Stores skills offered and skills wanted
•	Lets users set multiple availability slots
•	Sends and receives match requests
•	Checks for overlapping availability before confirming matches
•	Schedules meetings only when both users have common time slots
•	Generates video call links for scheduled meetings
•	Provides APIs for the frontend dashboard
________________________________________
Video Call Integration
SkillSwap uses Jitsi Meet to handle video calls between users.
•	When a match request is accepted, the backend automatically generates a Jitsi meeting link
•	Both users can join the same meeting room using that link
•	No extra login or API key is required
•	Meetings are only accessible during the scheduled time slot
Example meeting link format:
https://meet.jit.si/skillswap-{requestId}-{timestamp}
Jitsi was chosen because:
•	It is free and open-source
•	No complex setup is required
•	It works directly in the browser
•	Supports multiple participants
________________________________________
Tech Stack
•	Node.js
•	Express.js
•	PostgreSQL
•	JWT Authentication
•	Cookie-based sessions
•	Jitsi Meet (for video calls)


