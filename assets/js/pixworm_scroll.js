document.querySelectorAll(".option").forEach(option => {
    option.addEventListener("click", () => {
        // Check if the clicked option is already active
        if (option.classList.contains("active")) {
            option.classList.remove("active"); // Remove active class if already active
        } else {
            // Remove active class from all options
            document.querySelectorAll(".option").forEach(opt => opt.classList.remove("active"));

            // Add active class to the clicked option
            option.classList.add("active");
        }
    });
});
