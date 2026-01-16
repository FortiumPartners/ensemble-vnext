"""String utility module with common string manipulation functions."""


def capitalize_words(text: str) -> str:
    """Capitalize the first letter of each word in the input text.

    Args:
        text: The input string to process.

    Returns:
        A string with the first letter of each word capitalized.

    Examples:
        >>> capitalize_words("hello world")
        'Hello World'
        >>> capitalize_words("ALREADY CAPS")
        'Already Caps'
    """
    if not text:
        return text
    return text.title()


def reverse_string(text: str) -> str:
    """Reverse the input string.

    Args:
        text: The input string to reverse.

    Returns:
        The reversed string.

    Examples:
        >>> reverse_string("hello")
        'olleh'
        >>> reverse_string("a")
        'a'
    """
    if not text:
        return text
    return text[::-1]


def count_vowels(text: str) -> int:
    """Count the number of vowels (a, e, i, o, u) in the input text.

    Both uppercase and lowercase vowels are counted.

    Args:
        text: The input string to analyze.

    Returns:
        The count of vowels in the string.

    Examples:
        >>> count_vowels("hello")
        2
        >>> count_vowels("AEIOU")
        5
    """
    if not text:
        return 0
    vowels = set("aeiouAEIOU")
    return sum(1 for char in text if char in vowels)
